/**
 * A serial task queue (PROJECT_SPEC.md §8.3, B7.1.5).
 *
 * "Generation is synchronous but capped at 10 seconds, and runs in a queue of
 * concurrency 1 so two simultaneous requests cannot exhaust memory."
 *
 * Thirty lines rather than a dependency, because that is genuinely all this
 * is: a promise chain that never forks. Every caller awaits the tail, appends
 * itself, and becomes the new tail.
 *
 * **What this does and does not buy, stated plainly**, because B7.1.6 asks the
 * question and the honest answer matters more than the mechanism: serialising
 * bounds *memory*, since only one document's layout tree exists at a time. It
 * does not bound *latency* — PDF rendering is CPU work on the event loop, and
 * while it runs nothing else in the process progresses. The measurement is in
 * `backend/tests/pdf-responsiveness.test.ts` and the finding is recorded in the
 * decision log.
 */

export type QueueOptions = {
  /** Rejects the task if it has not settled in this long (§8.3: 10 seconds). */
  readonly timeoutMs: number;
  /** The Swedish message the timeout rejects with. */
  readonly timeoutMessage: string;
};

/**
 * Rejects after `ms`, and **clears its timer** whichever way the race ends.
 *
 * The clear is not tidiness. An un-cleared 10-second timer keeps the Node event
 * loop alive for 10 seconds after the work finished, so a process that renders
 * a document on its way down waits for a timeout that will never fire — and a
 * test suite hangs at the end of the file rather than failing anywhere useful.
 */
function rejectAfter(
  ms: number,
  message: string,
): {
  readonly promise: Promise<never>;
  readonly cancel: () => void;
} {
  let timer: NodeJS.Timeout | undefined;

  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });

  return {
    promise,
    cancel: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    },
  };
}

export type SerialQueue = {
  run: <T>(task: () => Promise<T>) => Promise<T>;
};

export function createSerialQueue(options: QueueOptions): SerialQueue {
  // The tail of the chain. Never rejects: a failed task must not poison the
  // queue for everyone behind it, so the chain is advanced with a settled
  // promise and the failure is delivered only to its own caller.
  let tail: Promise<void> = Promise.resolve();

  return {
    run: <T>(task: () => Promise<T>): Promise<T> => {
      const started = tail.then(async () => {
        const timeout = rejectAfter(options.timeoutMs, options.timeoutMessage);
        try {
          return await Promise.race([task(), timeout.promise]);
        } finally {
          timeout.cancel();
        }
      });

      // A timed-out task is still running: `Promise.race` abandons it, it does
      // not cancel it. Chaining the *outcome* rather than the task means the
      // next document starts as soon as this one is answered — which is the
      // behaviour §8.3 asks for, and the reason B7.1.6 measures whether the
      // timeout can be enforced at all rather than assuming it.
      tail = started.then(
        () => undefined,
        () => undefined,
      );

      return started;
    },
  };
}
