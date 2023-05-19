export class AbortablePromise<T> extends Promise<T> {
  private readonly controller: AbortController;
  public constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: any) => void,
      signal: AbortSignal
    ) => void
  ) {
    const controller = new AbortController();
    super((resolve, reject) => {
      executor(resolve, reject, controller.signal);
    });
    this.controller = controller;
  }

  public abort(reason?: any): void {
    this.controller.abort(reason);
  }
}
