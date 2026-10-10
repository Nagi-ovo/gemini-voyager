import { type ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { type AddressInfo, type Server, createConnection, createServer } from 'net';
import { resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { type DevBuildLock, acquireDevBuildLock, devBuildLockPort } from './dev-build-lock';

const LOCK_MODULE = resolve(__dirname, 'dev-build-lock.ts');
const children: ChildProcessWithoutNullStreams[] = [];
const servers: Server[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGKILL');
  for (const server of servers.splice(0)) server.close();
});

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

/** Another build process: takes the lock, prints "locked", releases on "release". */
function buildProcess(
  port: number,
  busyMs = 0,
): {
  child: ChildProcessWithoutNullStreams;
  locked: Promise<void>;
} {
  const script = `
    import { acquireDevBuildLock } from ${JSON.stringify(LOCK_MODULE)};
    const lock = await acquireDevBuildLock('test', { port: ${port}, pollMs: 20 });
    console.log('locked');
    // A build blocks its event loop for seconds while Rollup works.
    setTimeout(() => {
      const busyUntil = Date.now() + ${busyMs};
      while (Date.now() < busyUntil) {}
    }, 100);
    process.stdin.on('data', async () => { await lock.release(); console.log('released'); });
  `;
  const child = spawn('bun', ['-e', script]);
  children.push(child);
  const locked = new Promise<void>((done, fail) => {
    child.stdout.on('data', (data: Buffer) => {
      if (data.toString().includes('locked')) done();
    });
    child.once('exit', (code) => fail(new Error(`build process exited (${code})`)));
  });
  return { child, locked };
}

function track(lock: Promise<DevBuildLock>): {
  acquired: () => boolean;
  lock: Promise<DevBuildLock>;
} {
  let acquired = false;
  void lock.then(() => {
    acquired = true;
  });
  return { acquired: () => acquired, lock };
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

describe('dev build lock', () => {
  it('derives one stable port per outDir', () => {
    expect(devBuildLockPort('/repo/dist_chrome_dev')).toBe(
      devBuildLockPort('/repo/dist_chrome_dev'),
    );
    expect(devBuildLockPort('/repo/dist_chrome_dev')).toBeGreaterThanOrEqual(20000);
    expect(devBuildLockPort('/repo/dist_chrome_dev')).toBeLessThan(30000);
  });

  it('keeps a build waiting while another process holds the lock', async () => {
    const port = await freePort();
    const holder = buildProcess(port);
    await holder.locked;
    const waitedFor: string[] = [];

    const waiter = track(
      acquireDevBuildLock('test', { port, pollMs: 20, onWait: (id) => waitedFor.push(id) }),
    );
    await sleep(300);
    expect(waiter.acquired()).toBe(false);
    expect(waitedFor).toEqual([String(holder.child.pid)]);

    holder.child.stdin.write('release\n');
    await (await waiter.lock).release();
    expect(waiter.acquired()).toBe(true);
  });

  it('keeps waiting while the holder is too busy to answer probes', async () => {
    const port = await freePort();
    const holder = buildProcess(port, 5000);
    await holder.locked;
    const waiter = track(acquireDevBuildLock('test', { port, pollMs: 20 }));

    await sleep(4500);
    expect(waiter.acquired()).toBe(false);

    // The probes it could not answer were reset; the holder must survive them.
    const released = new Promise<void>((done) => {
      holder.child.stdout.on('data', (data: Buffer) => {
        if (data.toString().includes('released')) done();
      });
    });
    holder.child.stdin.write('release\n');
    await released;
    await (await waiter.lock).release();
  }, 15000);

  it('lets exactly one waiter in after the holder is killed mid-build', async () => {
    const port = await freePort();
    const holder = buildProcess(port);
    await holder.locked;
    const otherProcess = buildProcess(port);
    const thisProcess = track(acquireDevBuildLock('test', { port, pollMs: 20 }));
    let otherLocked = false;
    void otherProcess.locked.then(() => {
      otherLocked = true;
    });
    await sleep(200);
    expect(thisProcess.acquired() || otherLocked).toBe(false);

    holder.child.kill('SIGKILL');
    await Promise.race([thisProcess.lock, otherProcess.locked]);
    await sleep(300);
    expect(thisProcess.acquired() !== otherLocked).toBe(true);

    if (otherLocked) {
      otherProcess.child.stdin.write('release\n');
      await (await thisProcess.lock).release();
    } else {
      await (await thisProcess.lock).release();
      await otherProcess.locked;
    }
  });

  it('does not wait forever on a port held by an unrelated program', async () => {
    const port = await freePort();
    // Like most servers, it waits for the client to speak first.
    const foreign = createServer((socket) =>
      socket.on('data', () => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')),
    );
    servers.push(foreign);
    await new Promise<void>((done) => foreign.listen(port, '127.0.0.1', done));
    const foreignPorts: number[] = [];

    const lock = await acquireDevBuildLock('test', {
      port,
      pollMs: 10,
      onForeignListener: (heldPort) => foreignPorts.push(heldPort),
    });

    expect(foreignPorts).toEqual([port]);
    await lock.release();
  });

  it('releases even when a connected client never closes', async () => {
    const port = await freePort();
    const lock = await acquireDevBuildLock('test', { port });
    // allowHalfOpen: it keeps its sending side open after the holder's greeting.
    const client = createConnection({ port, host: '127.0.0.1', allowHalfOpen: true });
    client.on('error', () => undefined);
    // Wait for the holder's greeting, so the holder has accepted the connection.
    await new Promise<void>((done) => client.once('data', () => done()));

    await lock.release();

    // The port is free again: a second build takes the lock at once.
    const next = await acquireDevBuildLock('test', { port, foreignProbeLimit: 1 });
    await next.release();
    client.destroy();
  }, 5000);
});
