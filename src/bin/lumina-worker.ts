import { parentPort } from 'node:worker_threads';
import { compileLuminaTask, checkLuminaTask, setBuildConfig } from './lumina-core.js';

type InitMessage = {
  type: 'init';
  payload: {
    fileExtensions: string[];
    stdPath: string;
    cacheDir: string;
  };
};

type CompileMessage = {
  type: 'compile';
  id: number;
  payload: {
    sourcePath: string;
    outPath: string;
    target: 'cjs' | 'esm';
    grammarPath: string;
    useRecovery: boolean;
    diCfg?: boolean;
    useAstJs?: boolean;
  };
};

type CheckMessage = {
  type: 'check';
  id: number;
  payload: {
    sourcePath: string;
    grammarPath: string;
    useRecovery: boolean;
  };
};

type WorkerMessage = InitMessage | CompileMessage | CheckMessage;

if (parentPort) {
  parentPort.on('message', async (message: WorkerMessage) => {
    if (message.type === 'init') {
      setBuildConfig(message.payload);
      parentPort?.postMessage({ type: 'ready' });
      return;
    }
    if (message.type === 'compile') {
      try {
        const result = await compileLuminaTask(message.payload);
        parentPort?.postMessage({ id: message.id, ok: result.ok });
      } catch (error) {
        parentPort?.postMessage({ id: message.id, ok: false, error: String(error) });
      }
      return;
    }
    if (message.type === 'check') {
      try {
        const result = await checkLuminaTask(message.payload);
        parentPort?.postMessage({ id: message.id, ok: result.ok });
      } catch (error) {
        parentPort?.postMessage({ id: message.id, ok: false, error: String(error) });
      }
    }
  });
}
