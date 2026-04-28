type LuminaEnumLike = { $tag: string; $payload?: unknown } | { tag: string; values?: unknown[] };
type OptionLike<T = unknown> = { $tag: string; $payload?: T };
type TaggedRuntimeValue = { $tag: string; $payload?: unknown };

type OptionRuntime = {
  Some: (value: unknown) => OptionLike;
  None: OptionLike;
};

type ResultRuntime = {
  Ok: <T>(value: T) => TaggedRuntimeValue;
  Err: (message: string) => TaggedRuntimeValue;
};

type ChannelRuntimeDeps = {
  getOption: () => OptionRuntime;
  getResult: () => ResultRuntime;
  isEnumLike: (value: unknown) => value is LuminaEnumLike;
  getEnumTag: (value: LuminaEnumLike) => string;
};

type ChannelRuntimeConfig = ChannelRuntimeDeps | null;

let channelRuntimeConfig: ChannelRuntimeConfig = null;

const requireChannelRuntimeConfig = (): ChannelRuntimeDeps => {
  if (!channelRuntimeConfig) {
    throw new Error('Channel runtime is not configured');
  }
  return channelRuntimeConfig;
};

type ChannelMessage =
  | { __lumina_channel_value: unknown }
  | { __lumina_channel_close: true }
  | { __lumina_channel_ack: number };

const isChannelValue = (value: unknown): value is { __lumina_channel_value: unknown } =>
  !!value && typeof value === 'object' && '__lumina_channel_value' in value;

const isChannelClose = (value: unknown): value is { __lumina_channel_close: true } =>
  !!value && typeof value === 'object' && (value as { __lumina_channel_close?: unknown }).__lumina_channel_close === true;

const isChannelAck = (value: unknown): value is { __lumina_channel_ack: number } =>
  !!value && typeof value === 'object' && typeof (value as { __lumina_channel_ack?: unknown }).__lumina_channel_ack === 'number';

const resolveMessageChannel = (): typeof MessageChannel | null => {
  if (typeof MessageChannel === 'function') return MessageChannel;
  return null;
};

interface SenderSharedState {
  port: MessagePort;
  credits: number | null;
  refs: number;
  closed: boolean;
  receiverClosed: boolean;
  pending: Array<{ value: unknown; resolve: (ok: boolean) => void }>;
  flushing: boolean;
}

const createSenderSharedState = (port: MessagePort, capacity: number | null): SenderSharedState => ({
  port,
  credits: capacity,
  refs: 1,
  closed: false,
  receiverClosed: false,
  pending: [],
  flushing: false,
});

const senderPostNow = (state: SenderSharedState, value: unknown): boolean => {
  if (state.closed || state.receiverClosed) return false;
  if (state.credits !== null && state.credits <= 0) return false;
  if (state.credits !== null) {
    state.credits -= 1;
  }
  const payload: ChannelMessage = { __lumina_channel_value: value };
  try {
    state.port.postMessage(payload);
    return true;
  } catch {
    state.closed = true;
    return false;
  }
};

const drainPendingSends = (state: SenderSharedState): void => {
  if (state.flushing) return;
  state.flushing = true;
  try {
    while (state.pending.length > 0) {
      if (state.closed || state.receiverClosed) {
        while (state.pending.length > 0) {
          const item = state.pending.shift();
          if (item) item.resolve(false);
        }
        return;
      }
      if (state.credits !== null && state.credits <= 0) {
        return;
      }
      const next = state.pending.shift();
      if (!next) return;
      next.resolve(senderPostNow(state, next.value));
    }
  } finally {
    state.flushing = false;
  }
};

export class Sender<T> {
  private closedLocal = false;

  constructor(private readonly shared: SenderSharedState) {}

  static create<T>(port: MessagePort, capacity: number | null): Sender<T> {
    const shared = createSenderSharedState(port, capacity);
    const sender = new Sender<T>(shared);
    shared.port.start?.();
    shared.port.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const data = event.data;
      if (isChannelClose(data)) {
        shared.receiverClosed = true;
        shared.closed = true;
        drainPendingSends(shared);
        return;
      }
      if (isChannelAck(data) && shared.credits !== null) {
        shared.credits += data.__lumina_channel_ack;
        drainPendingSends(shared);
      }
    };
    return sender;
  }

  clone(): Sender<T> {
    const clone = new Sender<T>(this.shared);
    if (this.closedLocal || this.shared.closed || this.shared.receiverClosed) {
      clone.closedLocal = true;
      return clone;
    }
    this.shared.refs += 1;
    return clone;
  }

  private sendFailureReason(): string {
    if (this.shared.receiverClosed) return 'receiver closed';
    if (this.closedLocal || this.shared.closed) return 'sender closed';
    if (this.shared.credits !== null && this.shared.credits <= 0) return 'channel full';
    return 'send failed';
  }

  send(value: T): Promise<boolean> {
    if (this.closedLocal || this.shared.closed || this.shared.receiverClosed) {
      return Promise.resolve(false);
    }
    if (senderPostNow(this.shared, value)) {
      return Promise.resolve(true);
    }
    if (this.shared.closed || this.shared.receiverClosed) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      this.shared.pending.push({ value, resolve });
      drainPendingSends(this.shared);
    });
  }

  try_send(value: T): boolean {
    if (this.closedLocal || this.shared.closed || this.shared.receiverClosed) return false;
    return senderPostNow(this.shared, value);
  }

  send_result(value: T): TaggedRuntimeValue {
    const { getResult } = requireChannelRuntimeConfig();
    if (this.try_send(value)) return getResult().Ok(undefined);
    return getResult().Err(this.sendFailureReason());
  }

  async send_async_result(value: T): Promise<TaggedRuntimeValue> {
    const { getResult } = requireChannelRuntimeConfig();
    const ok = await this.send(value);
    if (ok) return getResult().Ok(undefined);
    return getResult().Err(this.sendFailureReason());
  }

  is_closed(): boolean {
    return this.closedLocal || this.shared.closed || this.shared.receiverClosed;
  }

  drop(): void {
    this.close();
  }

  close(): void {
    if (this.closedLocal) return;
    this.closedLocal = true;
    if (this.shared.refs > 0) this.shared.refs -= 1;
    if (this.shared.refs > 0) return;

    const shouldSendClose = !this.shared.closed;
    this.shared.closed = true;
    while (this.shared.pending.length > 0) {
      const item = this.shared.pending.shift();
      if (item) item.resolve(false);
    }
    if (shouldSendClose) {
      const payload: ChannelMessage = { __lumina_channel_close: true };
      try {
        this.shared.port.postMessage(payload);
      } catch {
        // ignore close failures
      }
    }
    try {
      this.shared.port.close();
    } catch {
      // ignore close failures
    }
  }
}

export class Receiver<T> {
  private queue: T[] = [];
  private waiters: Array<(value: OptionLike<T>) => void> = [];
  private closed = false;
  private errorMessage: string | null = null;
  private readonly capacity: number | null;
  private readonly ackOnConsume: boolean;

  constructor(
    private readonly port: MessagePort,
    capacity: number | null
  ) {
    this.capacity = capacity;
    this.ackOnConsume = this.capacity !== null && this.capacity > 0;
    this.port.onmessage = (event: MessageEvent<ChannelMessage>) => {
      const data = event.data;
      if (isChannelClose(data)) {
        this.closed = true;
        this.flushWaiters(requireChannelRuntimeConfig().getOption().None as OptionLike<T>);
        return;
      }
      if (isChannelAck(data)) return;
      const value = (isChannelValue(data) ? data.__lumina_channel_value : data) as T;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(requireChannelRuntimeConfig().getOption().Some(value) as OptionLike<T>);
        this.sendAckIfNeeded();
      } else {
        this.queue.push(value);
      }
    };
    this.port.onmessageerror = () => {
      this.closed = true;
      this.errorMessage = 'channel message error';
      this.flushWaiters(requireChannelRuntimeConfig().getOption().None as OptionLike<T>);
    };
    this.port.start?.();
  }

  private flushWaiters(value: OptionLike<T>): void {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter) waiter(value);
    }
  }

  private sendAckIfNeeded(): void {
    if (!this.ackOnConsume) return;
    const payload: ChannelMessage = { __lumina_channel_ack: 1 };
    this.port.postMessage(payload);
  }

  recv(): Promise<OptionLike<T>> {
    const { getOption } = requireChannelRuntimeConfig();
    if (this.queue.length > 0) {
      const value = this.queue.shift();
      this.sendAckIfNeeded();
      return Promise.resolve(getOption().Some(value as T) as OptionLike<T>);
    }
    if (this.closed) {
      return Promise.resolve(getOption().None as OptionLike<T>);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      if (this.capacity === 0) {
        const payload: ChannelMessage = { __lumina_channel_ack: 1 };
        this.port.postMessage(payload);
      }
    });
  }

  try_recv(): OptionLike<T> {
    const { getOption } = requireChannelRuntimeConfig();
    if (this.queue.length > 0) {
      const value = this.queue.shift();
      this.sendAckIfNeeded();
      return getOption().Some(value as T) as OptionLike<T>;
    }
    return getOption().None as OptionLike<T>;
  }

  async recv_result(): Promise<TaggedRuntimeValue> {
    const { getResult, isEnumLike, getEnumTag } = requireChannelRuntimeConfig();
    if (this.errorMessage && this.queue.length === 0) {
      return getResult().Err(this.errorMessage);
    }
    const value = await this.recv();
    const tag = value && typeof value === 'object' && isEnumLike(value) ? getEnumTag(value) : '';
    if (tag === 'None' && this.errorMessage) {
      return getResult().Err(this.errorMessage);
    }
    return getResult().Ok(value);
  }

  try_recv_result(): TaggedRuntimeValue {
    const { getResult } = requireChannelRuntimeConfig();
    if (this.errorMessage && this.queue.length === 0) {
      return getResult().Err(this.errorMessage);
    }
    return getResult().Ok(this.try_recv());
  }

  is_closed(): boolean {
    return this.closed;
  }

  drop(): void {
    this.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const payload: ChannelMessage = { __lumina_channel_close: true };
    try {
      this.port.postMessage(payload);
    } catch {
      // ignore close failures
    }
    this.port.close();
    this.flushWaiters(requireChannelRuntimeConfig().getOption().None as OptionLike<T>);
  }
}

export type ChannelRuntime = {
  is_available: () => boolean;
  new: <T>() => { sender: Sender<T>; receiver: Receiver<T> };
  bounded: <T>(capacity: number) => { sender: Sender<T>; receiver: Receiver<T> };
  send: <T>(sender: Sender<T>, value: T) => boolean;
  try_send: <T>(sender: Sender<T>, value: T) => boolean;
  send_async: <T>(sender: Sender<T>, value: T) => Promise<boolean>;
  send_result: <T>(sender: Sender<T>, value: T) => TaggedRuntimeValue;
  send_async_result: <T>(sender: Sender<T>, value: T) => Promise<TaggedRuntimeValue>;
  clone_sender: <T>(sender: Sender<T>) => Sender<T>;
  recv: <T>(receiver: Receiver<T>) => Promise<OptionLike<T>>;
  try_recv: <T>(receiver: Receiver<T>) => OptionLike<T>;
  recv_result: <T>(receiver: Receiver<T>) => Promise<TaggedRuntimeValue>;
  try_recv_result: <T>(receiver: Receiver<T>) => TaggedRuntimeValue;
  is_sender_closed: <T>(sender: Sender<T>) => boolean;
  is_receiver_closed: <T>(receiver: Receiver<T>) => boolean;
  close_sender: <T>(sender: Sender<T>) => void;
  close_receiver: <T>(receiver: Receiver<T>) => void;
  drop_sender: <T>(sender: Sender<T>) => void;
  drop_receiver: <T>(receiver: Receiver<T>) => void;
  close: <T>(ch: { sender: Sender<T>; receiver: Receiver<T> }) => void;
};

export const createChannelRuntime = (deps: ChannelRuntimeDeps): ChannelRuntime => {
  channelRuntimeConfig = deps;

  const channel: ChannelRuntime = {
    is_available: (): boolean => resolveMessageChannel() !== null,
    new: <T>(): { sender: Sender<T>; receiver: Receiver<T> } => channel.bounded<T>(-1),
    bounded: <T>(capacity: number): { sender: Sender<T>; receiver: Receiver<T> } => {
      const ChannelCtor = resolveMessageChannel();
      if (!ChannelCtor) {
        throw new Error('MessageChannel is not available in this environment');
      }
      const normalized = Number.isFinite(capacity) ? Math.trunc(capacity) : -1;
      const cap = normalized < 0 ? null : normalized;
      const { port1, port2 } = new ChannelCtor();
      return { sender: Sender.create<T>(port1, cap), receiver: new Receiver<T>(port2, cap) };
    },
    send: <T>(sender: Sender<T>, value: T): boolean => sender.try_send(value),
    try_send: <T>(sender: Sender<T>, value: T): boolean => sender.try_send(value),
    send_async: <T>(sender: Sender<T>, value: T): Promise<boolean> => sender.send(value),
    send_result: <T>(sender: Sender<T>, value: T): TaggedRuntimeValue => sender.send_result(value),
    send_async_result: <T>(sender: Sender<T>, value: T): Promise<TaggedRuntimeValue> => sender.send_async_result(value),
    clone_sender: <T>(sender: Sender<T>): Sender<T> => sender.clone(),
    recv: <T>(receiver: Receiver<T>): Promise<OptionLike<T>> => receiver.recv(),
    try_recv: <T>(receiver: Receiver<T>): OptionLike<T> => receiver.try_recv(),
    recv_result: <T>(receiver: Receiver<T>): Promise<TaggedRuntimeValue> => receiver.recv_result(),
    try_recv_result: <T>(receiver: Receiver<T>): TaggedRuntimeValue => receiver.try_recv_result(),
    is_sender_closed: <T>(sender: Sender<T>): boolean => sender.is_closed(),
    is_receiver_closed: <T>(receiver: Receiver<T>): boolean => receiver.is_closed(),
    close_sender: <T>(sender: Sender<T>): void => sender.close(),
    close_receiver: <T>(receiver: Receiver<T>): void => receiver.close(),
    drop_sender: <T>(sender: Sender<T>): void => sender.drop(),
    drop_receiver: <T>(receiver: Receiver<T>): void => receiver.drop(),
    close: <T>(ch: { sender: Sender<T>; receiver: Receiver<T> }): void => {
      ch.sender.close();
      ch.receiver.close();
    },
  };

  return channel;
};
