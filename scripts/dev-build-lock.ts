import { createHash } from 'crypto';
import { type Server, type Socket, createConnection, createServer } from 'net';

/**
 * Cross-process lock that serializes Chrome dev builds sharing one outDir.
 *
 * Two overlapping builds into `dist_chrome_dev` break the self-reloading dev
 * extension: Chrome reloads on the first build's marker while the second is
 * still writing, or the second build prunes the generation Chrome just loaded.
 * Holding this lock from buildStart until the marker is written makes the
 * second build start from the first one's committed output.
 *
 * The lock is a listening loopback TCP port derived from the outDir. The OS
 * releases it when the holder exits for any reason, including SIGKILL from a
 * nodemon restart, so there is no lock file to go stale, no PID to be reused,
 * and no takeover step for two waiters to race on.
 */
export interface DevBuildLock {
  release(): Promise<void>;
}

export interface AcquireDevBuildLockOptions {
  readonly port?: number;
  readonly pollMs?: number;
  /** Consecutive answers from a non-Voyager listener before building unlocked. */
  readonly foreignProbeLimit?: number;
  /** Consecutive unanswered probes before building unlocked (~1 s each). */
  readonly silentProbeLimit?: number;
  readonly onWait?: (holder: string) => void;
  readonly onForeignListener?: (port: number) => void;
}

const GREETING = 'voyager-dev-build-lock';
const PORT_RANGE_START = 20000;
const PORT_RANGE_SIZE = 10000;

/** A stable port below the OS ephemeral ranges, so outgoing sockets rarely hold it. */
export function devBuildLockPort(key: string): number {
  const hash = createHash('sha256').update(key).digest().readUInt32BE(0);
  return PORT_RANGE_START + (hash % PORT_RANGE_SIZE);
}

function listen(port: number): Promise<{ server: Server; sockets: Set<Socket> } | null> {
  return new Promise((resolve, reject) => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      // A waiter may reset the probe connection; that must not crash the build.
      socket.on('error', () => undefined);
      socket.end(`${GREETING} ${process.pid}\n`);
      // Drain a probe's nudge so the connection can close and release() resolves.
      socket.resume();
    });
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolve(null);
      else reject(error);
    });
    // `exclusive` keeps cluster workers from sharing the handle.
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      server.unref();
      resolve({ server, sockets });
    });
  });
}

type Holder =
  | { kind: 'build'; id: string }
  | { kind: 'none' }
  | { kind: 'foreign' }
  | { kind: 'silent' };

/** Ask whoever holds the port whether it is a Voyager build. */
function probe(port: number): Promise<Holder> {
  return new Promise((resolve) => {
    let received = '';
    const socket = createConnection({ port, host: '127.0.0.1' });
    // A Voyager holder greets on connect. Most other servers wait for the
    // client, so speak first if nothing arrived; they then reply or close.
    const nudge = setTimeout(() => socket.write('voyager?\n'), 300);
    const finish = (holder: Holder) => {
      clearTimeout(nudge);
      socket.destroy();
      resolve(holder);
    };
    // A build's event loop can stay blocked for seconds while Rollup works, so
    // silence means "busy", not "someone else".
    socket.setTimeout(1000, () => finish({ kind: 'silent' }));
    socket.on('data', (chunk) => {
      received += chunk.toString();
    });
    socket.on('end', () => {
      const [greeting, id] = received.trim().split(' ');
      finish(greeting === GREETING ? { kind: 'build', id: id ?? '?' } : { kind: 'foreign' });
    });
    // Refused: the holder exited between our bind and connect. Retry the bind.
    socket.on('error', () => finish({ kind: 'none' }));
  });
}

/**
 * Wait until no other Voyager dev build holds the lock for `key`, then take
 * it. A port held by an unrelated program never blocks the build forever.
 */
export async function acquireDevBuildLock(
  key: string,
  {
    port = devBuildLockPort(key),
    pollMs = 200,
    foreignProbeLimit = 3,
    silentProbeLimit = 120,
    onWait,
    onForeignListener,
  }: AcquireDevBuildLockOptions = {},
): Promise<DevBuildLock> {
  let announcedHolder: string | null = null;
  let foreignProbes = 0;
  let silentProbes = 0;
  for (;;) {
    let held: Awaited<ReturnType<typeof listen>>;
    try {
      held = await listen(port);
    } catch {
      // Loopback binding denied (e.g. a sandbox): build unlocked rather than fail.
      onForeignListener?.(port);
      return { release: async () => undefined };
    }
    if (held) {
      const { server, sockets } = held;
      return {
        release: () =>
          new Promise((resolve) => {
            // A connected client that never closes would otherwise keep close() pending.
            for (const socket of sockets) socket.destroy();
            server.close(() => resolve());
          }),
      };
    }
    const holder = await probe(port);
    foreignProbes = holder.kind === 'foreign' ? foreignProbes + 1 : 0;
    silentProbes = holder.kind === 'silent' ? silentProbes + 1 : 0;
    if (foreignProbes >= foreignProbeLimit || silentProbes >= silentProbeLimit) {
      onForeignListener?.(port);
      return { release: async () => undefined };
    }
    if (holder.kind === 'build' && holder.id !== announcedHolder) {
      announcedHolder = holder.id;
      onWait?.(holder.id);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
