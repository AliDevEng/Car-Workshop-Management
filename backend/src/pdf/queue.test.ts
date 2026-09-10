import { describe, expect, it } from 'vitest';
import { createSerialQueue } from './queue.js';

/**
 * B7.1.5 — "a queue of concurrency 1 so two simultaneous requests cannot
 * exhaust memory" (§8.3), with the 10-second cap.
 */

const options = { timeoutMs: 50, timeoutMessage: 'timeout' };

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = () => {
      settle();
    };
  });
  return { promise, resolve };
}

describe('createSerialQueue', () => {
  it('never runs two tasks at once', async () => {
    const queue = createSerialQueue({ ...options, timeoutMs: 5000 });
    let running = 0;
    let peak = 0;

    const task = async (): Promise<void> => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setImmediate(resolve));
      running -= 1;
    };

    await Promise.all(Array.from({ length: 10 }, () => queue.run(task)));

    expect(peak).toBe(1);
  });

  it('preserves submission order', async () => {
    const queue = createSerialQueue({ ...options, timeoutMs: 5000 });
    const finished: number[] = [];

    await Promise.all(
      [0, 1, 2, 3].map((index) =>
        queue.run(async () => {
          await new Promise((resolve) => setTimeout(resolve, 4 - index));
          finished.push(index);
        }),
      ),
    );

    expect(finished).toEqual([0, 1, 2, 3]);
  });

  it('rejects a task that overruns the timeout', async () => {
    const queue = createSerialQueue(options);
    const slow = deferred();

    await expect(queue.run(() => slow.promise)).rejects.toThrow('timeout');
    slow.resolve();
  });

  it('keeps serving after a task times out', async () => {
    // A timed-out task is abandoned, not cancelled — `Promise.race` cannot
    // stop it. The queue advances on the *outcome*, so the next document must
    // not be held behind work that has already been answered for.
    const queue = createSerialQueue(options);
    const slow = deferred();

    await expect(queue.run(() => slow.promise)).rejects.toThrow('timeout');
    await expect(queue.run(() => Promise.resolve('next'))).resolves.toBe(
      'next',
    );

    slow.resolve();
  });

  it('does not let one task’s failure poison the queue', async () => {
    const queue = createSerialQueue({ ...options, timeoutMs: 5000 });

    await expect(
      queue.run(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    await expect(
      queue.run(() => Promise.resolve('still working')),
    ).resolves.toBe('still working');
  });

  it('clears its timer when a task succeeds', async () => {
    // An un-cleared 10-second timer keeps the event loop alive for 10 seconds
    // after the work is done, which hangs a process on its way down and a test
    // file at its end. Measured rather than asserted structurally: the whole
    // run has to finish well inside the timeout.
    const queue = createSerialQueue({ timeoutMs: 5000, timeoutMessage: 'x' });
    const started = Date.now();

    await queue.run(() => Promise.resolve('quick'));

    expect(Date.now() - started).toBeLessThan(1000);
  });
});
