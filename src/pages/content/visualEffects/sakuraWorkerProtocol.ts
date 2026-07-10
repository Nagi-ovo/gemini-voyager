export const SAKURA_RENDERER_CONNECT_MESSAGE = 'gv-sakura-renderer-connect';

type SakuraInitState = {
  sessionId: number;
  width: number;
  height: number;
  dpr: number;
  visible: boolean;
  mode: 'active' | 'draining';
  drainId: number;
};

export type SakuraRendererInitMessage = SakuraInitState & {
  type: 'init';
};

export type SakuraWorkerInitMessage = SakuraInitState & {
  type: 'init';
  canvas: OffscreenCanvas;
};

type SakuraRuntimeCommand =
  | {
      type: 'resize';
      sessionId: number;
      width: number;
      height: number;
      dpr: number;
    }
  | {
      type: 'visibility';
      sessionId: number;
      visible: boolean;
    }
  | {
      type: 'set-mode';
      sessionId: number;
      mode: 'active' | 'draining';
      drainId: number;
    }
  | {
      type: 'dispose';
      sessionId: number;
    };

export type SakuraRendererCommand = SakuraRendererInitMessage | SakuraRuntimeCommand;
export type SakuraWorkerCommand = SakuraWorkerInitMessage | SakuraRuntimeCommand;

export type SakuraWorkerEvent =
  | {
      type: 'ready';
      sessionId: number;
    }
  | {
      type: 'drained';
      sessionId: number;
      drainId: number;
    }
  | {
      type: 'fatal';
      sessionId: number;
      reason: string;
    };
