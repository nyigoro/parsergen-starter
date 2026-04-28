import type { ModuleExport, ModuleNamespace } from './module-registry-types.js';
import { type Type, freshTypeVar, promiseType } from './types.js';
import {
  adt,
  fnType,
  moduleFunction,
  moduleFunctionWithScheme,
  primitive,
  schemeFromVars,
} from './module-registry-builders.js';
import type { StdDomainModules } from './module-registry-domains.js';
export function createStdConcurrencyDomainModules(): Pick<StdDomainModules,
  'channelModule' | 'asyncChannelModule' | 'sabChannelModule' | 'threadModule' | 'syncModule'> {
  const sabChannelModule: ModuleNamespace = (() => {
    const optionInt = adt('Option', [primitive('int')]);
    const optionFloat = adt('Option', [primitive('float')]);
    const resultVoidString = adt('Result', [primitive('void'), primitive('string')]);

    const makeTypedExports = (
      suffix: 'i32' | 'u32' | 'f32' | 'f64',
      valueTypeName: 'int' | 'float'
    ): Array<[string, ModuleExport]> => {
      const senderTypeName =
        suffix === 'i32'
          ? 'SABSenderI32'
          : suffix === 'u32'
            ? 'SABSenderU32'
            : suffix === 'f32'
              ? 'SABSenderF32'
              : 'SABSenderF64';
      const receiverTypeName =
        suffix === 'i32'
          ? 'SABReceiverI32'
          : suffix === 'u32'
            ? 'SABReceiverU32'
            : suffix === 'f32'
              ? 'SABReceiverF32'
              : 'SABReceiverF64';
      const channelTypeName =
        suffix === 'i32'
          ? 'SABChannelI32'
          : suffix === 'u32'
            ? 'SABChannelU32'
            : suffix === 'f32'
              ? 'SABChannelF32'
              : 'SABChannelF64';
      const senderT = adt(senderTypeName);
      const receiverT = adt(receiverTypeName);
      const channelT = adt(channelTypeName);
      const valueType = primitive(valueTypeName);
      const optionType = valueTypeName === 'int' ? optionInt : optionFloat;

      return [
        [
          `bounded_${suffix}`,
          moduleFunction(
            `bounded_${suffix}`,
            ['int'],
            channelTypeName,
            [primitive('int')],
            channelT,
            ['capacity'],
            'std://sab_channel'
          ),
        ],
        [
          `send_${suffix}`,
          moduleFunction(
            `send_${suffix}`,
            [senderTypeName, valueTypeName],
            'bool',
            [senderT, valueType],
            primitive('bool'),
            ['sender', 'value'],
            'std://sab_channel'
          ),
        ],
        [
          `try_send_${suffix}`,
          moduleFunction(
            `try_send_${suffix}`,
            [senderTypeName, valueTypeName],
            'bool',
            [senderT, valueType],
            primitive('bool'),
            ['sender', 'value'],
            'std://sab_channel'
          ),
        ],
        [
          `send_async_${suffix}`,
          moduleFunction(
            `send_async_${suffix}`,
            [senderTypeName, valueTypeName],
            'Promise<bool>',
            [senderT, valueType],
            promiseType(primitive('bool')),
            ['sender', 'value'],
            'std://sab_channel'
          ),
        ],
        [
          `send_timeout_${suffix}`,
          moduleFunction(
            `send_timeout_${suffix}`,
            [senderTypeName, valueTypeName, 'int'],
            'Promise<Result<void,string>>',
            [senderT, valueType, primitive('int')],
            promiseType(resultVoidString),
            ['sender', 'value', 'timeout_ms'],
            'std://sab_channel'
          ),
        ],
        [
          `recv_${suffix}`,
          moduleFunction(
            `recv_${suffix}`,
            [receiverTypeName],
            `Promise<Option<${valueTypeName}>>`,
            [receiverT],
            promiseType(optionType),
            ['receiver'],
            'std://sab_channel'
          ),
        ],
        [
          `try_recv_${suffix}`,
          moduleFunction(
            `try_recv_${suffix}`,
            [receiverTypeName],
            `Option<${valueTypeName}>`,
            [receiverT],
            optionType,
            ['receiver'],
            'std://sab_channel'
          ),
        ],
        [
          `close_sender_${suffix}`,
          moduleFunction(
            `close_sender_${suffix}`,
            [senderTypeName],
            'void',
            [senderT],
            primitive('void'),
            ['sender'],
            'std://sab_channel'
          ),
        ],
        [
          `close_receiver_${suffix}`,
          moduleFunction(
            `close_receiver_${suffix}`,
            [receiverTypeName],
            'void',
            [receiverT],
            primitive('void'),
            ['receiver'],
            'std://sab_channel'
          ),
        ],
        [
          `is_sender_closed_${suffix}`,
          moduleFunction(
            `is_sender_closed_${suffix}`,
            [senderTypeName],
            'bool',
            [senderT],
            primitive('bool'),
            ['sender'],
            'std://sab_channel'
          ),
        ],
        [
          `is_receiver_closed_${suffix}`,
          moduleFunction(
            `is_receiver_closed_${suffix}`,
            [receiverTypeName],
            'bool',
            [receiverT],
            primitive('bool'),
            ['receiver'],
            'std://sab_channel'
          ),
        ],
        [
          `close_${suffix}`,
          moduleFunction(
            `close_${suffix}`,
            [channelTypeName],
            'void',
            [channelT],
            primitive('void'),
            ['channel'],
            'std://sab_channel'
          ),
        ],
      ];
    };

    const exports = new Map<string, ModuleExport>([
      [
        'is_available',
        moduleFunction(
          'is_available',
          [],
          'bool',
          [],
          primitive('bool'),
          [],
          'std://sab_channel'
        ),
      ],
      ...makeTypedExports('i32', 'int'),
      ...makeTypedExports('u32', 'int'),
      ...makeTypedExports('f32', 'float'),
      ...makeTypedExports('f64', 'float'),
    ]);

    return {
      kind: 'module',
      name: 'sab_channel',
      moduleId: 'std://sab_channel',
      exports,
    };
  })();

  const channelModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const senderT = adt('Sender', [t]);
    const receiverT = adt('Receiver', [t]);
    const channelT = adt('Channel', [t]);
    const optionT = adt('Option', [t]);
    const sendResultT = adt('Result', [primitive('void'), primitive('string')]);
    const recvResultT = adt('Result', [optionT, primitive('string')]);
    const newType: Type = fnType([], channelT);
    const sendType: Type = fnType([senderT, t], primitive('bool'));
    const trySendType: Type = fnType([senderT, t], primitive('bool'));
    const sendAsyncType: Type = fnType([senderT, t], promiseType(primitive('bool')));
    const sendResultType: Type = fnType([senderT, t], sendResultT);
    const sendAsyncResultType: Type = fnType([senderT, t], promiseType(sendResultT));
    const cloneSenderType: Type = fnType([senderT], senderT);
    const recvType: Type = fnType([receiverT], promiseType(optionT));
    const tryRecvType: Type = fnType([receiverT], optionT);
    const recvResultType: Type = fnType([receiverT], promiseType(recvResultT));
    const tryRecvResultType: Type = fnType([receiverT], recvResultT);
    const boundedType: Type = fnType([primitive('int')], channelT);
    const closeSenderType: Type = fnType([senderT], primitive('void'));
    const closeReceiverType: Type = fnType([receiverT], primitive('void'));
    const senderClosedType: Type = fnType([senderT], primitive('bool'));
    const receiverClosedType: Type = fnType([receiverT], primitive('bool'));
    const closeType: Type = fnType([channelT], primitive('void'));
    const availableType: Type = fnType([], primitive('bool'));

    return {
      kind: 'module',
      name: 'channel',
      moduleId: 'std://channel',
      exports: new Map([
        [
          'new',
          moduleFunctionWithScheme(
            'new',
            [],
            'Channel<any>',
            schemeFromVars(newType, [t]),
            [],
            'std://channel'
          ),
        ],
        [
          'send',
          moduleFunctionWithScheme(
            'send',
            ['Sender<any>', 'any'],
            'bool',
            schemeFromVars(sendType, [t]),
            ['sender', 'value'],
            'std://channel'
          ),
        ],
        [
          'send_async',
          moduleFunctionWithScheme(
            'send_async',
            ['Sender<any>', 'any'],
            'Promise<bool>',
            schemeFromVars(sendAsyncType, [t]),
            ['sender', 'value'],
            'std://channel'
          ),
        ],
        [
          'try_send',
          moduleFunctionWithScheme(
            'try_send',
            ['Sender<any>', 'any'],
            'bool',
            schemeFromVars(trySendType, [t]),
            ['sender', 'value'],
            'std://channel'
          ),
        ],
        [
          'send_result',
          moduleFunctionWithScheme(
            'send_result',
            ['Sender<any>', 'any'],
            'Result<void,string>',
            schemeFromVars(sendResultType, [t]),
            ['sender', 'value'],
            'std://channel'
          ),
        ],
        [
          'send_async_result',
          moduleFunctionWithScheme(
            'send_async_result',
            ['Sender<any>', 'any'],
            'Promise<Result<void,string>>',
            schemeFromVars(sendAsyncResultType, [t]),
            ['sender', 'value'],
            'std://channel'
          ),
        ],
        [
          'clone_sender',
          moduleFunctionWithScheme(
            'clone_sender',
            ['Sender<any>'],
            'Sender<any>',
            schemeFromVars(cloneSenderType, [t]),
            ['sender'],
            'std://channel'
          ),
        ],
        [
          'bounded',
          moduleFunctionWithScheme(
            'bounded',
            ['int'],
            'Channel<any>',
            schemeFromVars(boundedType, [t]),
            ['capacity'],
            'std://channel'
          ),
        ],
        [
          'recv',
          moduleFunctionWithScheme(
            'recv',
            ['Receiver<any>'],
            'Promise<Option<any>>',
            schemeFromVars(recvType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'try_recv',
          moduleFunctionWithScheme(
            'try_recv',
            ['Receiver<any>'],
            'Option<any>',
            schemeFromVars(tryRecvType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'recv_result',
          moduleFunctionWithScheme(
            'recv_result',
            ['Receiver<any>'],
            'Promise<Result<Option<any>,string>>',
            schemeFromVars(recvResultType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'try_recv_result',
          moduleFunctionWithScheme(
            'try_recv_result',
            ['Receiver<any>'],
            'Result<Option<any>,string>',
            schemeFromVars(tryRecvResultType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'close_sender',
          moduleFunctionWithScheme(
            'close_sender',
            ['Sender<any>'],
            'void',
            schemeFromVars(closeSenderType, [t]),
            ['sender'],
            'std://channel'
          ),
        ],
        [
          'close_receiver',
          moduleFunctionWithScheme(
            'close_receiver',
            ['Receiver<any>'],
            'void',
            schemeFromVars(closeReceiverType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'drop_sender',
          moduleFunctionWithScheme(
            'drop_sender',
            ['Sender<any>'],
            'void',
            schemeFromVars(closeSenderType, [t]),
            ['sender'],
            'std://channel'
          ),
        ],
        [
          'drop_receiver',
          moduleFunctionWithScheme(
            'drop_receiver',
            ['Receiver<any>'],
            'void',
            schemeFromVars(closeReceiverType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'is_sender_closed',
          moduleFunctionWithScheme(
            'is_sender_closed',
            ['Sender<any>'],
            'bool',
            schemeFromVars(senderClosedType, [t]),
            ['sender'],
            'std://channel'
          ),
        ],
        [
          'is_receiver_closed',
          moduleFunctionWithScheme(
            'is_receiver_closed',
            ['Receiver<any>'],
            'bool',
            schemeFromVars(receiverClosedType, [t]),
            ['receiver'],
            'std://channel'
          ),
        ],
        [
          'close',
          moduleFunctionWithScheme(
            'close',
            ['Channel<any>'],
            'void',
            schemeFromVars(closeType, [t]),
            ['channel'],
            'std://channel'
          ),
        ],
        [
          'is_available',
          moduleFunctionWithScheme(
            'is_available',
            [],
            'bool',
            schemeFromVars(availableType, []),
            [],
            'std://channel'
          ),
        ],
      ]),
    };
  })();

  const asyncChannelModule: ModuleNamespace = {
    kind: 'module',
    name: 'async_channel',
    moduleId: 'std://async_channel',
    exports: new Map(channelModule.exports),
  };

  const threadModule: ModuleNamespace = (() => {
    const t = freshTypeVar();
    const threadT = adt('Thread');
    const threadHandleT = adt('ThreadHandle', [t]);
    const joinResultT = adt('Result', [t, primitive('string')]);
    const optionT = adt('Option', [t]);
    const resultT = adt('Result', [threadT, primitive('string')]);
    const spawnType: Type = fnType([fnType([], t)], threadHandleT);
    const spawnWorkerType: Type = fnType([primitive('string')], promiseType(resultT));
    const joinType: Type = fnType([threadHandleT], promiseType(joinResultT));
    const postType: Type = fnType([threadT, t], primitive('bool'));
    const recvType: Type = fnType([threadT], promiseType(optionT));
    const tryRecvType: Type = fnType([threadT], optionT);
    const terminateType: Type = fnType([threadT], promiseType(primitive('void')));
    const joinWorkerType: Type = fnType([threadT], promiseType(primitive('int')));
    const availableType: Type = fnType([], primitive('bool'));

    return {
      kind: 'module',
      name: 'thread',
      moduleId: 'std://thread',
      exports: new Map([
        [
          'spawn',
          moduleFunctionWithScheme(
            'spawn',
            ['fn() -> any'],
            'ThreadHandle<any>',
            schemeFromVars(spawnType, []),
            ['task'],
            'std://thread'
          ),
        ],
        [
          'spawn_worker',
          moduleFunctionWithScheme(
            'spawn_worker',
            ['string'],
            'Promise<Result<Thread,string>>',
            schemeFromVars(spawnWorkerType, []),
            ['specifier'],
            'std://thread'
          ),
        ],
        [
          'post',
          moduleFunctionWithScheme(
            'post',
            ['Thread', 'any'],
            'bool',
            schemeFromVars(postType, [t]),
            ['thread', 'value'],
            'std://thread'
          ),
        ],
        [
          'recv',
          moduleFunctionWithScheme(
            'recv',
            ['Thread'],
            'Promise<Option<any>>',
            schemeFromVars(recvType, [t]),
            ['thread'],
            'std://thread'
          ),
        ],
        [
          'try_recv',
          moduleFunctionWithScheme(
            'try_recv',
            ['Thread'],
            'Option<any>',
            schemeFromVars(tryRecvType, [t]),
            ['thread'],
            'std://thread'
          ),
        ],
        [
          'terminate',
          moduleFunctionWithScheme(
            'terminate',
            ['Thread'],
            'Promise<void>',
            schemeFromVars(terminateType, []),
            ['thread'],
            'std://thread'
          ),
        ],
        [
          'join',
          moduleFunctionWithScheme(
            'join',
            ['ThreadHandle<any>'],
            'Promise<Result<any,string>>',
            schemeFromVars(joinType, [t]),
            ['thread'],
            'std://thread'
          ),
        ],
        [
          'join_worker',
          moduleFunctionWithScheme(
            'join_worker',
            ['Thread'],
            'Promise<int>',
            schemeFromVars(joinWorkerType, []),
            ['thread'],
            'std://thread'
          ),
        ],
        [
          'is_available',
          moduleFunctionWithScheme(
            'is_available',
            [],
            'bool',
            schemeFromVars(availableType, []),
            [],
            'std://thread'
          ),
        ],
      ]),
    };
  })();

  const syncModule: ModuleNamespace = (() => {
    const mutexT = adt('Mutex');
    const semaphoreT = adt('Semaphore');
    const atomicI32T = adt('AtomicI32');
    const mutexNewType: Type = fnType([], mutexT);
    const mutexAcquireType: Type = fnType([mutexT], promiseType(primitive('bool')));
    const mutexTryAcquireType: Type = fnType([mutexT], primitive('bool'));
    const mutexReleaseType: Type = fnType([mutexT], primitive('bool'));
    const mutexIsLockedType: Type = fnType([mutexT], primitive('bool'));
    const semaphoreNewType: Type = fnType([primitive('int')], semaphoreT);
    const semaphoreAcquireType: Type = fnType([semaphoreT], promiseType(primitive('bool')));
    const semaphoreTryAcquireType: Type = fnType([semaphoreT], primitive('bool'));
    const semaphoreReleaseType: Type = fnType([semaphoreT, primitive('int')], primitive('void'));
    const semaphoreAvailableType: Type = fnType([semaphoreT], primitive('int'));
    const atomicNewType: Type = fnType([primitive('int')], atomicI32T);
    const atomicAvailableType: Type = fnType([], primitive('bool'));
    const atomicLoadType: Type = fnType([atomicI32T], primitive('int'));
    const atomicStoreType: Type = fnType([atomicI32T, primitive('int')], primitive('int'));
    const atomicAddType: Type = fnType([atomicI32T, primitive('int')], primitive('int'));
    const atomicSubType: Type = fnType([atomicI32T, primitive('int')], primitive('int'));
    const atomicCmpExType: Type = fnType([atomicI32T, primitive('int'), primitive('int')], primitive('int'));

    return {
      kind: 'module',
      name: 'sync',
      moduleId: 'std://sync',
      exports: new Map([
        [
          'mutex_new',
          moduleFunctionWithScheme(
            'mutex_new',
            [],
            'Mutex',
            schemeFromVars(mutexNewType, []),
            [],
            'std://sync'
          ),
        ],
        [
          'mutex_acquire',
          moduleFunctionWithScheme(
            'mutex_acquire',
            ['Mutex'],
            'Promise<bool>',
            schemeFromVars(mutexAcquireType, []),
            ['mutex'],
            'std://sync'
          ),
        ],
        [
          'mutex_try_acquire',
          moduleFunctionWithScheme(
            'mutex_try_acquire',
            ['Mutex'],
            'bool',
            schemeFromVars(mutexTryAcquireType, []),
            ['mutex'],
            'std://sync'
          ),
        ],
        [
          'mutex_release',
          moduleFunctionWithScheme(
            'mutex_release',
            ['Mutex'],
            'bool',
            schemeFromVars(mutexReleaseType, []),
            ['mutex'],
            'std://sync'
          ),
        ],
        [
          'mutex_is_locked',
          moduleFunctionWithScheme(
            'mutex_is_locked',
            ['Mutex'],
            'bool',
            schemeFromVars(mutexIsLockedType, []),
            ['mutex'],
            'std://sync'
          ),
        ],
        [
          'semaphore_new',
          moduleFunctionWithScheme(
            'semaphore_new',
            ['int'],
            'Semaphore',
            schemeFromVars(semaphoreNewType, []),
            ['permits'],
            'std://sync'
          ),
        ],
        [
          'semaphore_acquire',
          moduleFunctionWithScheme(
            'semaphore_acquire',
            ['Semaphore'],
            'Promise<bool>',
            schemeFromVars(semaphoreAcquireType, []),
            ['semaphore'],
            'std://sync'
          ),
        ],
        [
          'semaphore_try_acquire',
          moduleFunctionWithScheme(
            'semaphore_try_acquire',
            ['Semaphore'],
            'bool',
            schemeFromVars(semaphoreTryAcquireType, []),
            ['semaphore'],
            'std://sync'
          ),
        ],
        [
          'semaphore_release',
          moduleFunctionWithScheme(
            'semaphore_release',
            ['Semaphore', 'int'],
            'void',
            schemeFromVars(semaphoreReleaseType, []),
            ['semaphore', 'count'],
            'std://sync'
          ),
        ],
        [
          'semaphore_available',
          moduleFunctionWithScheme(
            'semaphore_available',
            ['Semaphore'],
            'int',
            schemeFromVars(semaphoreAvailableType, []),
            ['semaphore'],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_new',
          moduleFunctionWithScheme(
            'atomic_i32_new',
            ['int'],
            'AtomicI32',
            schemeFromVars(atomicNewType, []),
            ['initial'],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_is_available',
          moduleFunctionWithScheme(
            'atomic_i32_is_available',
            [],
            'bool',
            schemeFromVars(atomicAvailableType, []),
            [],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_load',
          moduleFunctionWithScheme(
            'atomic_i32_load',
            ['AtomicI32'],
            'int',
            schemeFromVars(atomicLoadType, []),
            ['atomic'],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_store',
          moduleFunctionWithScheme(
            'atomic_i32_store',
            ['AtomicI32', 'int'],
            'int',
            schemeFromVars(atomicStoreType, []),
            ['atomic', 'value'],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_add',
          moduleFunctionWithScheme(
            'atomic_i32_add',
            ['AtomicI32', 'int'],
            'int',
            schemeFromVars(atomicAddType, []),
            ['atomic', 'delta'],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_sub',
          moduleFunctionWithScheme(
            'atomic_i32_sub',
            ['AtomicI32', 'int'],
            'int',
            schemeFromVars(atomicSubType, []),
            ['atomic', 'delta'],
            'std://sync'
          ),
        ],
        [
          'atomic_i32_compare_exchange',
          moduleFunctionWithScheme(
            'atomic_i32_compare_exchange',
            ['AtomicI32', 'int', 'int'],
            'int',
            schemeFromVars(atomicCmpExType, []),
            ['atomic', 'expected', 'replacement'],
            'std://sync'
          ),
        ],
      ]),
    };
  })();
  return {
    channelModule,
    asyncChannelModule,
    sabChannelModule,
    threadModule,
    syncModule
  };
}
