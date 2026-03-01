# Lesson 6: Concurrency and Async

## Goals

- Use thread/channel APIs for concurrent workflows.
- Use async producer/consumer patterns.

## Threads + Join

```lumina
import { thread, io, str } from "@std";

fn worker(id: i32) -> i32 {
  id * 2
}

fn main() -> void {
  let h = thread.spawn(|| worker(42));
  let result = h.join();
  io.println(str.from_int(result));
}
```

## MPSC Channel Pattern

```lumina
import { channel, thread, io, str } from "@std";

fn main() -> void {
  let (tx, rx) = channel.new();

  thread.spawn(move || {
    for i in 0..5 {
      tx.send(i);
    }
    tx.close();
  });

  while let Some(v) = rx.recv() {
    io.println(str.from_int(v));
  }
}
```

## Async Channel Pattern

```lumina
import { async_channel } from "@std";

async fn producer(tx: Sender<i32>) -> void {
  for i in 0..10 {
    await tx.send(i);
  }
}

async fn consumer(rx: Receiver<i32>) -> void {
  while let Some(v) = await rx.recv() {
    io.println("{v}");
  }
}
```

## Exercises

1. Spawn 4 workers and collect results.
2. Implement producer/consumer with close semantics.
3. Add error handling around send/recv with `Result`.

## Notes

- Prefer message passing over shared mutable state.
- Keep worker functions small and pure when possible.
