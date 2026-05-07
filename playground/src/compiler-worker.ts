import {
  compileLuminaProject,
  formatLuminaSource,
  type CompileResult,
  type PlaygroundCompileInput,
} from './compiler-bridge';

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

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<CompileWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'compile') {
      const result = compileLuminaProject(request.input);
      workerScope.postMessage({
        id: request.id,
        type: 'compile-result',
        result,
      } satisfies CompileWorkerResponse);
      return;
    }

    if (request.type === 'format') {
      workerScope.postMessage({
        id: request.id,
        type: 'format-result',
        value: formatLuminaSource(request.source),
      } satisfies CompileWorkerResponse);
    }
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies CompileWorkerResponse);
  }
};
