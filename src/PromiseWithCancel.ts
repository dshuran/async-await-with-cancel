type GeneratorWithArgs<Args extends unknown[]> = (
  ...args: Args
) => IterableIterator<unknown>;

interface GeneratorWithThrowMethod<T> extends Iterator<T, T, unknown> {
  throw(error?: unknown): IteratorResult<T>;
}

function runGenerator<Args extends unknown[]>(
  fn: GeneratorWithArgs<Args>,
  args: Args
): GeneratorWithThrowMethod<unknown> {
  const gen: IterableIterator<unknown> = fn(...args);
  gen.throw = (err?: unknown) => {
    return {
      done: false,
      value: `error = ${err}`,
    };
  };

  return gen as GeneratorWithThrowMethod<unknown>;
}

export function runWithCancel<Args extends unknown[]>(
  fn: GeneratorWithArgs<Args>,
  ...args: Args
): CancellablePromise<unknown> {
  const gen = runGenerator(fn, args);

  let cancelled: boolean = false;
  let cancel: (() => void) | null = null;

  const promise = new CancellablePromise<unknown>((resolve, reject) => {
    // Set cancel function to return it from our fn
    cancel = () => {
      cancelled = true;
      reject({ reason: "cancelled" });
    };

    // The first run of the onFulfilled function.
    onFulfilled();

    function onFulfilled(res?: unknown): unknown {
      if (cancelled) return;

      try {
        const result = gen.next(res);
        next(result);
        return null;
      } catch (e) {
        return reject(e);
      }
    }

    function onRejected(err: any): void {
      let result: IteratorResult<unknown>;

      try {
        result = gen.throw(err);
      } catch (e) {
        return reject(e);
      }

      next(result);
    }

    // Here we resolve promise and recursively run onFulfilled/onRejected again
    function next<T>({ done, value }: { done?: boolean; value: T }): void {
      if (done) {
        resolve(value);
        return;
      }

      Promise.resolve(value).then(
        (res: T) => {
          onFulfilled(res);
        },
        (res: unknown) => {
          onRejected(res);
        }
      );
    }
  });

  promise.cancelFunc = cancel;

  return promise;
}

export class CancellablePromise<T> extends Promise<T> {
  public cancelFunc: (() => void) | null = null;

  public cancel() {
    if (!this.cancelFunc)
      throw new Error("CancellablePromise can only be used with runWithCancel");
    this.cancelFunc();
  }
}
