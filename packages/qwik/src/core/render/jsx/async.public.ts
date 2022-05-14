import type { ValueOrPromise } from '../../util/types';
import type { JSXNode } from './types/jsx-node';

/**
 * Represents queryable status of a `Promise`.
 *
 * The `PromiseValue` is intended to be used with `<Async>`.
 * A `Promise` can't be examined for its status in a synchronous way.
 * When rendering it is desirable to check on the status of the promise and
 * determine if it is pending, resolved or rejected in a synchronous way
 * so that its status can be used in the rendering output.
 *
 * ### Example
 * ```typescript
 * <Async resolve={Promise.resolve('some value')}>
 *   {(response: PromiseValue<string>) => {
 *     if (response.isPending) return <span>loading...</span>;
 *     if (response.isResolved) return <span>{response.value}</span>;
 *     if (response.isRejected) return <pre>{response.rejection}</pre>;
 *   }}
 * </Async>
 * ```
 *
 * @see `<Async>` for more context.
 *
 * @public
 */
export type PromiseValue<T> =
  | {
      /**
       * Flag indicating if the `Promise` is in pending state (has not been resolved).
       *
       * If `true` then `value` and `rejection` are both undefined.
       * if `false` then either `value` or `rejection` contains value.
       *
       * @see `isResolved` and `isRejection`
       */
      readonly isPending: true;
      /**
       * Flag indicating if the `Promise` has been resolved.
       *
       * If `true` then `value` contains the resolution of the `Promise`.
       *
       * @see `value`.
       */
      readonly isResolved: false;
      /**
       * Flag indicating if the `Promise` has been rejected.
       *
       * If `true` then `rejection` contains the rejection of the `Promise`.
       *
       * @see `rejection`.
       */
      readonly isRejected: false;
      /**
       * Value of the resolved `Promise`.
       *
       * `value` is set only if `isResolved` is `true`.
       *
       * @see `isResolved`.
       */
      readonly value: undefined;
      /**
       * Value of the rejected `Promise`.
       *
       * `rejection` is set only if `isRejected` is `true`.
       *
       * @see `isRejected`.
       */
      readonly rejection: undefined;
    }
  | {
      /**
       * Flag indicating if the `Promise` is in pending state (has not been resolved).
       *
       * If `true` then `value` and `rejection` are both undefined.
       * if `false` then either `value` or `rejection` contains value.
       *
       * @see `isResolved` and `isRejection`
       */
      readonly isPending: false;
      /**
       * Flag indicating if the `Promise` has been resolved.
       *
       * If `true` then `value` contains the resolution of the `Promise`.
       *
       * @see `value`.
       */
      readonly isResolved: true;
      /**
       * Flag indicating if the `Promise` has been rejected.
       *
       * If `true` then `rejection` contains the rejection of the `Promise`.
       *
       * @see `rejection`.
       */
      readonly isRejected: false;
      /**
       * Value of the resolved `Promise`.
       *
       * `value` is set only if `isResolved` is `true`.
       *
       * @see `isResolved`.
       */
      readonly value: T;
      /**
       * Value of the rejected `Promise`.
       *
       * `rejection` is set only if `isRejected` is `true`.
       *
       * @see `isRejected`.
       */
      readonly rejection: undefined;
    }
  | {
      /**
       * Flag indicating if the `Promise` is in pending state (has not been resolved).
       *
       * If `true` then `value` and `rejection` are both undefined.
       * if `false` then either `value` or `rejection` contains value.
       *
       * @see `isResolved` and `isRejection`
       */
      readonly isPending: false;
      /**
       * Flag indicating if the `Promise` has been resolved.
       *
       * If `true` then `value` contains the resolution of the `Promise`.
       *
       * @see `value`.
       */
      readonly isResolved: false;
      /**
       * Flag indicating if the `Promise` has been rejected.
       *
       * If `true` then `rejection` contains the rejection of the `Promise`.
       *
       * @see `rejection`.
       */
      readonly isRejected: true;
      /**
       * Value of the resolved `Promise`.
       *
       * `value` is set only if `isResolved` is `true`.
       *
       * @see `isResolved`.
       */
      readonly value: undefined;
      /**
       * Value of the rejected `Promise`.
       *
       * `rejection` is set only if `isRejected` is `true`.
       *
       * @see `isRejected`.
       */
      readonly rejection: any;
    };

interface AsyncWithChildren<T> {
  /**
   * A `Promise` to await resolution on.
   *
   * The `resolved`/`rejected` value is that communicated to a single callback.
   *
   * The `callback` is invoked twice:
   * 1. First with pending `PromiseValue` allowing the view to render text
   *    communicating that application is waiting on some data to resolve.
   * 2. Second with either `resolved` or `rejected` value allowing the view
   *    to communicate the `resolved` value or the `error`.
   *
   * ```typescript
   * <Async resolve={Promise.resolve('some value')}>
   *   {(response) => {
   *     if (response.isPending) return <span>loading...</span>;
   *     if (response.isResolved) return <span>{response.value}</span>;
   *     if (response.isRejected) return <pre>{response.rejection}</pre>;
   *   }}
   * </Async>
   * ```
   */
  resolve: ValueOrPromise<T>;
  /**
   * A single callback which is invoke before `Promise` resolution and after it is `resolved`.
   *
   * The `callback` is invoked twice:
   * 1. First with pending `PromiseValue` allowing the view to render text
   *    communicating that application is waiting on some data to resolve.
   * 2. Second with either `resolved` or `rejected` value allowing the view
   *    to communicate the `resolved` value or the `error`.
   *
   * ```typescript
   * <Async resolve={Promise.resolve('some value')}>
   *   {(response) => {
   *     if (response.isPending) return <span>loading...</span>;
   *     if (response.isResolved) return <span>{response.value}</span>;
   *     if (response.isRejected) return <pre>{response.rejection}</pre>;
   *   }}
   * </Async>
   * ```
   */
  children: (observablePromise: PromiseValue<T>) => any;
}

export interface AsyncResolve<T> {
  /**
   * A `Promise` to await resolution on.
   *
   * The `resolved`/`rejected` value is that communicated to `onResolved`/`onRejected`
   * respectively. While `<Async>` waits for resolution `onPending` is invoked.
   *
   * ```typescript
   * <Async
   *   resolve={Promise.resolve('some value')}
   *   onPending={() => <span>loading...</span>}
   *   onResolved={(value) => <span>{value}</span>}
   *   onError={(rejection) => <pre>{rejection}</pre>}
   * />
   * ```
   */
  resolve: ValueOrPromise<T>;
  /**
   * Callback invoked allowing the view to render UI communicating to the user that
   * application is waiting on data.
   *
   * ```typescript
   * <Async
   *   resolve={Promise.resolve('some value')}
   *   onPending={() => <span>loading...</span>}
   *   onResolved={(value) => <span>{value}</span>}
   *   onError={(rejection) => <pre>{rejection}</pre>}
   * />
   * ```
   */
  onPending?: () => any;
  /**
   * Callback invoked allowing the view to render UI with the resolved value of the `Promise`.
   *
   * ```typescript
   * <Async
   *   resolve={Promise.resolve('some value')}
   *   onPending={() => <span>loading...</span>}
   *   onResolved={(value) => <span>{value}</span>}
   *   onError={(rejection) => <pre>{rejection}</pre>}
   * />
   * ```
   */
  onResolved: (value: T) => any;
  /**
   * Callback invoked allowing the view to render UI when the `Promise` has been rejected.
   *
   * ```typescript
   * <Async
   *   resolve={Promise.resolve('some value')}
   *   onPending={() => <span>loading...</span>}
   *   onResolved={(value) => <span>{value}</span>}
   *   onError={(rejection) => <pre>{rejection}</pre>}
   * />
   * ```
   */
  onError?: (error: any) => any;
}
export type AsyncProps<T> = AsyncResolve<T> | AsyncWithChildren<T>;

/**
 * Use to render asynchronous (`Promise`) values.
 *
 * A `Promise` does not allow a synchronous examination of its state. For this reason
 * `<Async>` provides a mechanism to render pending, resolved and error state of a `Promise`.
 * `<Async>` provides that mechanism by registering a `then` method with the `Promise` and
 * providing callbacks hooks for `pending`, `resolved` and `rejected` state of the promise.
 *
 * Additionally, `<Async>` automatically re-renders the portion of the view when the status
 * of the `Promise` changes.
 *
 * `<Async>` provides three callbacks:
 * - `onPending`: invoked initially to provide a way for the template to provide output while
 *   waiting for the `promise` to resolve.
 * - `onResolved`: invoked when the `promise` is `resolved` allowing the template to generate
 *   output using the `resolved` value.
 * - `onError`: invoked when the `promise` is `rejected` allowing the template to generate
 *   error output describing the problem.
 *
 * The `<Async>` can be used in two ways, which are semantically equivalent and are provided
 * based on the developer needs/preferences.
 *
 * ### Using multiple callbacks
 *
 * ```typescript
 * <Async
 *   resolve={Promise.resolve('some value')}
 *   onPending={() => <span>loading...</span>}
 *   onResolved={(value) => <span>{value}</span>}
 *   onError={(rejection) => <pre>{rejection}</pre>}
 * />
 * ```
 *
 * ### Using single callbacks
 *
 * ```typescript
 * <Async resolve={Promise.resolve('some value')}>
 *   {(response) => {
 *     if (response.isPending) return <span>loading...</span>;
 *     if (response.isResolved) return <span>{response.value}</span>;
 *     if (response.isRejected) return <pre>{response.rejection}</pre>;
 *   }}
 * </Async>
 * ```
 *
 * @param onPending - invoked initially to provide a way for the template to provide output while
 *   waiting for the `promise` to resolve.
 * @param onResolved - invoked when the `promise` is `resolved` allowing the template to generate
 *   output using the `resolved` value.
 * @param onError - invoked when the `promise` is `rejected` allowing the template to generate
 *   error output describing the problem.
 * @param children -  a single callback function for `onPending`, `onResolved` and `onError`.
 *   (Use either `children` or `onPending`, `onResolved` and `onError`, but not both.)
 *   See "Using multiple callbacks" vs "Using single callbacks" above.
 *
 * @public
 */

export function Async<T>(props: AsyncProps<T>): JSXNode<any> {
  // TODO(misko): implement onPending/onResolved/onError
  if (!('children' in props)) {
    throw new Error('IMPLEMENT');
  }
  const children = [props.children].flat()[0];
  const renderFn = typeof children == 'function' ? children : null;
  const promiseValue: PromiseValue<any> = {
    isPending: true,
    isResolved: false,
    value: undefined,
    isRejected: false,
    rejection: undefined,
  };
  let pending: any;
  const jsxPromise = new Promise((resolve, reject) => {
    pending = renderFn && renderFn(promiseValue);
    Promise.resolve(props.resolve).then(
      (value) => {
        (promiseValue as any).isPending = false;
        (promiseValue as any).isResolved = true;
        (promiseValue as any).value = value;
        return resolve(renderFn && renderFn(promiseValue));
      },
      (error) => {
        (promiseValue as any).isPending = false;
        (promiseValue as any).isRejected = true;
        (promiseValue as any).rejection = error;
        return reject(renderFn && renderFn(promiseValue));
      }
    );
  }) as JSXPromise;
  jsxPromise.whilePending = pending;
  return jsxPromise as any;
}

export interface JSXPromise<T = any> extends Promise<T> {
  whilePending?: any;
}
