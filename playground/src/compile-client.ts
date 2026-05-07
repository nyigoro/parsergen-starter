import type { CompileResult, PlaygroundCompileInput } from './compiler-bridge';

type CompileWorkerRequest =
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

type CompileWorkerResponse =
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

let requestCounter = 0;

const createCompilerWorker = (): Worker =>
  new Worker(new URL('./compiler-worker.ts', import.meta.url), {
    type: 'module',
  });

const runWorkerTask = <T>(
  request: CompileWorkerRequest,
  consume: (response: CompileWorkerResponse) => T,
  signal?: AbortSignal
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const worker = createCompilerWorker();
    const cleanup = (): void => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = (): void => {
      cleanup();
      reject(new Error(signal?.reason ? String(signal.reason) : 'Compiler task cancelled.'));
    };

    if (signal?.aborted) {
      abort();
      return;
    }

    signal?.addEventListener('abort', abort, { once: true });

    worker.onmessage = (event: MessageEvent<CompileWorkerResponse>) => {
      if (event.data?.id !== request.id) return;
      try {
        if (event.data.type === 'error') {
          throw new Error(event.data.message);
        }
        const result = consume(event.data);
        cleanup();
        resolve(result);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };

    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'Compiler worker failed.'));
    };

    worker.postMessage(request);
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
