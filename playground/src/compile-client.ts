import type { CompileResult, PlaygroundCompileInput } from './compiler-bridge';

type CompileWorkerRequest =
  | {
      id: number;
      type: 'warm';
    }
  | {
      id: number;
      type: 'compile';
      input: PlaygroundCompileInput;
    }
  | {
      id: number;
      type: 'format';
      source: string;
    };

type CompileWorkerReadyResponse = {
  type: 'ready';
  bootMs: number;
};

type CompileWorkerResponse =
  | CompileWorkerReadyResponse
  | {
      id: number;
      type: 'warm-result';
      bootMs: number;
    }
  | {
      id: number;
      type: 'compile-result';
      result: CompileResult;
    }
  | {
      id: number;
      type: 'format-result';
      value: string;
    }
  | {
      id: number;
      type: 'error';
      message: string;
    };

export type CompileWorkerTelemetry = {
  bootMs: number | null;
  restartCount: number;
  completedTaskCount: number;
  activeRequestCount: number;
  lastTaskType: CompileWorkerRequest['type'] | null;
};

type PendingRequest<T> = {
  id: number;
  type: CompileWorkerRequest['type'];
  consume: (response: CompileWorkerResponse) => T;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
  abort?: () => void;
};

let requestCounter = 0;
let compilerWorker: Worker | null = null;
let workerReady:
  | Promise<void>
  | null = null;
let resolveWorkerReady: (() => void) | null = null;
let rejectWorkerReady: ((error: Error) => void) | null = null;
let workerBootMs: number | null = null;
let workerRestartCount = 0;
let workerCompletedTaskCount = 0;
let lastTaskType: CompileWorkerRequest['type'] | null = null;

const pendingRequests = new Map<number, PendingRequest<unknown>>();

const createCompilerWorker = (): Worker =>
  new Worker(new URL('./compiler-worker.ts', import.meta.url), {
    type: 'module',
  });

const clearWorkerReady = (): void => {
  workerReady = null;
  resolveWorkerReady = null;
  rejectWorkerReady = null;
};

const rejectPendingRequests = (message: string): void => {
  for (const pending of pendingRequests.values()) {
    pending.signal?.removeEventListener('abort', pending.abort ?? (() => {}));
    pending.reject(new Error(message));
  }
  pendingRequests.clear();
};

const teardownCompilerWorker = (message: string): void => {
  compilerWorker?.terminate();
  compilerWorker = null;
  clearWorkerReady();
  workerBootMs = null;
  rejectPendingRequests(message);
};

const ensureCompilerWorker = async (): Promise<Worker> => {
  if (compilerWorker && workerReady) {
    await workerReady;
    return compilerWorker;
  }

  compilerWorker = createCompilerWorker();
  workerReady = new Promise<void>((resolve, reject) => {
    resolveWorkerReady = resolve;
    rejectWorkerReady = reject;
  });

  compilerWorker.onmessage = (event: MessageEvent<CompileWorkerResponse>) => {
    const payload = event.data;
    if (!payload) return;

    if (payload.type === 'ready') {
      workerBootMs = payload.bootMs;
      resolveWorkerReady?.();
      resolveWorkerReady = null;
      rejectWorkerReady = null;
      return;
    }

    const pending = pendingRequests.get(payload.id);
    if (!pending) return;

    pendingRequests.delete(payload.id);
    if (pending.abort) {
      pending.signal?.removeEventListener('abort', pending.abort);
    }

    try {
      if (payload.type === 'error') {
        throw new Error(payload.message);
      }
      workerCompletedTaskCount += 1;
      pending.resolve(pending.consume(payload));
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };

  compilerWorker.onerror = (event) => {
    const message = event.message || 'Compiler worker failed.';
    rejectWorkerReady?.(new Error(message));
    rejectWorkerReady = null;
    resolveWorkerReady = null;
    teardownCompilerWorker(message);
  };

  await workerReady;
  return compilerWorker;
};

const runWorkerTask = async <T>(
  request: CompileWorkerRequest,
  consume: (response: CompileWorkerResponse) => T,
  signal?: AbortSignal
): Promise<T> => {
  if (signal?.aborted) {
    throw new Error(signal.reason ? String(signal.reason) : 'Compiler task cancelled.');
  }

  const worker = await ensureCompilerWorker();
  lastTaskType = request.type;

  return new Promise<T>((resolve, reject) => {
    const pending: PendingRequest<T> = {
      id: request.id,
      type: request.type,
      consume,
      resolve,
      reject,
      signal,
    };

    const abort = (): void => {
      pendingRequests.delete(request.id);
      reject(new Error(signal?.reason ? String(signal.reason) : 'Compiler task cancelled.'));
    };

    if (signal) {
      pending.abort = abort;
      signal.addEventListener('abort', abort, { once: true });
    }

    pendingRequests.set(request.id, pending);
    worker.postMessage(request);
  });
};

export const getCompileWorkerTelemetry = (): CompileWorkerTelemetry => ({
  bootMs: workerBootMs,
  restartCount: workerRestartCount,
  completedTaskCount: workerCompletedTaskCount,
  activeRequestCount: pendingRequests.size,
  lastTaskType,
});

export const compileProjectInWorker = (
  input: PlaygroundCompileInput,
  signal?: AbortSignal
): Promise<CompileResult> =>
  runWorkerTask(
    {
      id: ++requestCounter,
      type: 'compile',
      input,
    },
    (response) => {
      if (response.type !== 'compile-result') {
        throw new Error('Compiler worker returned an unexpected response.');
      }
      return response.result;
    },
    signal
  );

export const warmCompilerWorker = (): Promise<void> =>
  runWorkerTask(
    {
      id: ++requestCounter,
      type: 'warm',
    },
    (response) => {
      if (response.type !== 'warm-result') {
        throw new Error('Compiler worker returned an unexpected warm response.');
      }
    }
  );

export const formatSourceInWorker = (source: string, signal?: AbortSignal): Promise<string> =>
  runWorkerTask(
    {
      id: ++requestCounter,
      type: 'format',
      source,
    },
    (response) => {
      if (response.type !== 'format-result') {
        throw new Error('Formatter worker returned an unexpected response.');
      }
      return response.value;
    },
    signal
  );
