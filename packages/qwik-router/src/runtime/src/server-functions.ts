import {
  $,
  implicit$FirstArg,
  isDev,
  isServer,
  noSerialize,
  useStore,
  withLocale,
  type QRL,
  type ValueOrPromise,
} from '@qwik.dev/core';
import { _deserialize, _getContextHostElement, _serialize } from '@qwik.dev/core/internal';
import * as v from 'valibot';
import * as z from 'zod';
import { QACTION_KEY, QDATA_KEY, QFN_KEY } from './constants';
import type { FormSubmitCompletedDetail } from './form-component';
import { getRequestEvent } from './route-loaders';
import type {
  ActionConstructor,
  ActionConstructorQRL,
  ActionInternal,
  ActionOptions,
  ActionStore,
  DataValidator,
  Editable,
  JSONObject,
  RequestEvent,
  RequestEventAction,
  RequestEventBase,
  RouteActionResolver,
  RouteLocation,
  ServerConfig,
  ServerFunction,
  ServerQRL,
  ValibotConstructor,
  ValibotConstructorQRL,
  ValibotDataValidator,
  ValidatorConstructor,
  ValidatorConstructorQRL,
  ValidatorReturn,
  ZodConstructor,
  ZodConstructorQRL,
  ZodDataValidator,
} from './types';
import { useAction, useLocation } from './use-functions';

/** @internal */
export const routeActionQrl = ((
  actionQrl: QRL<(form: JSONObject, event: RequestEventAction) => unknown>,
  ...rest: (ActionOptions | DataValidator)[]
) => {
  const { id, validators, invalidate } = getValidators(rest, actionQrl);
  function action() {
    const loc = useLocation() as Editable<RouteLocation>;
    const currentAction = useAction();
    const initialState: Editable<Partial<ActionStore<unknown, unknown>>> = {
      actionPath: `?${QACTION_KEY}=${id}`,
      submitted: false,
      isRunning: false,
      status: undefined,
      value: undefined,
      formData: undefined,
    };
    const state = useStore<Editable<ActionStore<unknown, unknown>>>(() => {
      const value = currentAction.value;
      if (value && value?.id === id) {
        const data = value.data;
        if (data instanceof FormData) {
          initialState.formData = data;
        }
        if (value.output) {
          const { status, result } = value.output;
          initialState.status = status;
          initialState.value = result;
        }
      }
      return initialState as ActionStore<unknown, unknown>;
    });

    const submit = $((input: unknown | FormData | SubmitEvent = {}) => {
      if (isServer) {
        throw new Error(`Actions can not be invoked within the server during SSR.
Action.run() can only be called on the browser, for example when a user clicks a button, or submits a form.`);
      }
      let data: unknown | FormData | SubmitEvent;
      let form: HTMLFormElement | undefined;
      if (input instanceof SubmitEvent) {
        form = input.target as HTMLFormElement;
        data = new FormData(form);
        if (
          (input.submitter instanceof HTMLInputElement ||
            input.submitter instanceof HTMLButtonElement) &&
          input.submitter.name
        ) {
          if (input.submitter.name) {
            (data as FormData).append(input.submitter.name, input.submitter.value);
          }
        }
      } else {
        data = input;
      }
      return new Promise<RouteActionResolver>((resolve) => {
        if (data instanceof FormData) {
          state.formData = data;
        }
        state.submitted = true;
        state.isRunning = true;
        loc.isNavigating = true;
        currentAction.value = {
          data: data as Record<string, unknown>,
          id,
          resolve: noSerialize(resolve),
        };
      }).then(({ result, status }) => {
        state.isRunning = false;
        state.status = status;
        state.value = result;
        if (form) {
          if (form.getAttribute('data-spa-reset') === 'true') {
            form.reset();
          }
          const detail = { status, value: result } satisfies FormSubmitCompletedDetail<unknown>;
          form.dispatchEvent(
            new CustomEvent('submitcompleted', {
              bubbles: false,
              cancelable: false,
              composed: false,
              detail: detail,
            })
          );
        }
        return {
          status: status,
          value: result,
        };
      });
    });
    initialState.submit = submit;

    return state;
  }
  action.__brand = 'server_action' as const;
  action.__validators = validators;
  action.__qrl = actionQrl;
  action.__id = id;
  action.__invalidate = invalidate;
  Object.freeze(action);

  return action satisfies ActionInternal;
}) as unknown as ActionConstructorQRL;

/** @internal */
export const globalActionQrl = ((
  actionQrl: QRL<(form: JSONObject, event: RequestEventAction) => unknown>,
  ...rest: (ActionOptions | DataValidator)[]
) => {
  const action = routeActionQrl(actionQrl, ...(rest as any));
  if (isServer) {
    if (typeof globalThis._qwikActionsMap === 'undefined') {
      globalThis._qwikActionsMap = new Map();
    }
    globalThis._qwikActionsMap!.set((action as ActionInternal).__id, action as ActionInternal);
  }
  return action;
}) as ActionConstructorQRL;

/**
 * Define a route action that handles form submissions or programmatic invocations.
 *
 * Actions run on the server when submitted from the client. The result is returned as an
 * `ActionStore` with `.value` for success data and `.error` for errors (including validation errors
 * from `zod$`/`valibot$` where `.fieldErrors` etc. are accessible directly on `.error`).
 *
 * By default, after an action completes, ALL route loaders are re-run and their updated data is
 * sent back in the response. This can be controlled with:
 *
 * - `invalidate: [loader1, loader2]` — Only invalidate specific loaders. The client re-fetches them
 *   individually. Other loaders keep their current data.
 * - `invalidate: []` — No loaders are re-run or invalidated. The action response only contains the
 *   action result. Use this when the action doesn't affect any loader data.
 *
 * The `strictLoaders` Vite plugin option applies `invalidate: []` globally for all actions that
 * don't specify an explicit `invalidate` option.
 *
 * @public
 */
export const routeAction$: ActionConstructor = /*#__PURE__*/ implicit$FirstArg(
  routeActionQrl
) as any;

/** @public */
export const globalAction$: ActionConstructor = /*#__PURE__*/ implicit$FirstArg(
  globalActionQrl
) as any;

/** @internal */
export const validatorQrl = ((
  validator: QRL<(ev: RequestEvent, data: unknown) => ValueOrPromise<ValidatorReturn>>
): DataValidator => {
  if (isServer) {
    return {
      validate: validator,
    };
  }
  return undefined as any;
}) as ValidatorConstructorQRL;

/** @public */
export const validator$: ValidatorConstructor = /*#__PURE__*/ implicit$FirstArg(validatorQrl);

const flattenValibotIssues = (issues: v.GenericIssue[]) => {
  return issues.reduce<Record<string, string | string[]>>((acc, issue) => {
    if (issue.path) {
      const hasArrayType = issue.path.some((path) => path.type === 'array');
      if (hasArrayType) {
        const keySuffix = issue.expected === 'Array' ? '[]' : '';
        const key =
          issue.path
            .map((item) => (item.type === 'array' ? '*' : item.key))
            .join('.')
            .replace(/\.\*/g, '[]') + keySuffix;
        acc[key] = acc[key] || [];
        if (Array.isArray(acc[key])) {
          (acc[key] as string[]).push(issue.message);
        }
        return acc;
      } else {
        acc[issue.path.map((item) => item.key).join('.')] = issue.message;
      }
    }
    return acc;
  }, {});
};

/** @internal */
export const valibotQrl: ValibotConstructorQRL = (
  qrl: QRL<
    | v.GenericSchema
    | v.GenericSchemaAsync
    | ((ev: RequestEvent) => v.GenericSchema | v.GenericSchemaAsync)
  >
): ValibotDataValidator => {
  if (!__EXPERIMENTAL__.valibot) {
    throw new Error(
      'Valibot is an experimental feature and is not enabled. Please enable the feature flag by adding `experimental: ["valibot"]` to your qwikVite plugin options.'
    );
  }
  if (isServer) {
    return {
      __brand: 'valibot',
      async validate(ev, inputData) {
        const schema: v.GenericSchema | v.GenericSchemaAsync = await qrl
          .resolve()
          .then((obj) => (typeof obj === 'function' ? obj(ev) : obj));
        const data = inputData ?? (await ev.parseBody());
        const result = await v.safeParseAsync(schema, data);
        if (result.success) {
          return {
            success: true,
            data: result.output,
          };
        } else {
          if (isDev) {
            console.error('ERROR: Valibot validation failed', result.issues);
          }
          return {
            success: false,
            status: 400,
            error: {
              formErrors: v.flatten(result.issues).root ?? [],
              fieldErrors: flattenValibotIssues(result.issues),
            },
          };
        }
      },
    };
  }
  return undefined as never;
};

/** @beta */
export const valibot$: ValibotConstructor = /*#__PURE__*/ implicit$FirstArg(valibotQrl);

const flattenZodIssues = (issues: z.ZodIssue | z.ZodIssue[]) => {
  issues = Array.isArray(issues) ? issues : [issues];
  return issues.reduce<Record<string, string | string[]>>((acc, issue) => {
    const isExpectingArray = 'expected' in issue && issue.expected === 'array';
    const hasArrayType = issue.path.some((path) => typeof path === 'number') || isExpectingArray;
    if (hasArrayType) {
      const keySuffix = 'expected' in issue && issue.expected === 'array' ? '[]' : '';
      const key =
        issue.path
          .map((path) => (typeof path === 'number' ? '*' : path))
          .join('.')
          .replace(/\.\*/g, '[]') + keySuffix;
      acc[key] = acc[key] || [];
      if (Array.isArray(acc[key])) {
        (acc[key] as string[]).push(issue.message);
      }
      return acc;
    } else {
      acc[issue.path.join('.')] = issue.message;
    }
    return acc;
  }, {});
};

/** @internal */
export const zodQrl: ZodConstructorQRL = (
  qrl: QRL<
    z.ZodRawShape | z.Schema | ((z: typeof import('zod').z, ev: RequestEvent) => z.ZodRawShape)
  >
): ZodDataValidator => {
  if (isServer) {
    return {
      __brand: 'zod',
      async validate(ev, inputData) {
        const schema: z.Schema = await qrl.resolve().then((obj) => {
          if (typeof obj === 'function') {
            obj = obj(z, ev);
          }
          if (obj instanceof z.Schema) {
            return obj;
          } else {
            return z.object(obj);
          }
        });
        const data = inputData ?? (await ev.parseBody());
        const result = await withLocale(ev.locale(), () => schema.safeParseAsync(data));
        if (result.success) {
          return result;
        } else {
          if (isDev) {
            console.error('ERROR: Zod validation failed', result.error.issues);
          }
          return {
            success: false,
            status: 400,
            error: {
              formErrors: result.error.flatten().formErrors,
              fieldErrors: flattenZodIssues(result.error.issues),
            },
          };
        }
      },
    };
  }
  return undefined as never;
};

/** @public */
export const zod$: ZodConstructor = /*#__PURE__*/ implicit$FirstArg(zodQrl);

/** @internal */
export const serverQrl = <T extends ServerFunction>(
  qrl: QRL<T>,
  options?: ServerConfig
): ServerQRL<T> => {
  if (isServer) {
    const captured = qrl.getCaptured();
    if (captured && captured.length > 0 && !_getContextHostElement()) {
      throw new Error('For security reasons, we cannot serialize QRLs that capture lexical scope.');
    }
  }

  const method = options?.method?.toUpperCase?.() || 'POST';
  const headers = options?.headers || {};
  const origin = options?.origin || '';
  const fetchOptions = options?.fetchOptions || {};

  return $(async function (this: RequestEventBase | undefined, ...args: Parameters<T>) {
    // move to ServerConfig
    const abortSignal =
      args.length > 0 && args[0] instanceof AbortSignal ? (args.shift() as AbortSignal) : undefined;

    if (isServer) {
      // Running during SSR, we can call the function directly
      return qrl.apply(getRequestEvent(this), args);
    } else {
      // Running on the client, we need to call the function via HTTP
      let filteredArgs: unknown[] | undefined = args.map((arg: unknown) => {
        if (arg instanceof SubmitEvent && arg.target instanceof HTMLFormElement) {
          return new FormData(arg.target);
        } else if (arg instanceof Event) {
          return null;
        } else if (arg instanceof Node) {
          return null;
        }
        return arg;
      });
      if (!filteredArgs.length) {
        filteredArgs = undefined;
      }
      const qrlHash = qrl.getHash();
      // Handled by `pureServerFunction` middleware
      let query = '';
      const config = {
        ...fetchOptions,
        method,
        headers: {
          ...headers,
          'Content-Type': 'application/qwik-json',
          Accept: 'application/json, application/qwik-json, text/qwik-json-stream, text/plain',
          // Required so we don't call accidentally
          'X-QRL': qrlHash,
        },
        signal: abortSignal,
      };
      // Serialize the arguments in an array so they don't deduplicate
      // If there is captured scope, include it in the serialization
      // This is deserialized by runServerFunction()
      const captured = qrl.getCaptured();
      let toSend: [] | [typeof filteredArgs] | [typeof filteredArgs, ...unknown[]] = [filteredArgs];
      if (captured?.length) {
        toSend = [filteredArgs, ...captured];
      } else {
        toSend = filteredArgs ? [filteredArgs] : [];
      }
      const body = await _serialize(toSend);
      if (method === 'GET') {
        query += `&${QDATA_KEY}=${encodeURIComponent(body)}`;
      } else {
        config.body = body;
      }
      const res = await fetch(`${origin}?${QFN_KEY}=${qrlHash}${query}`, config);

      const contentType = res.headers.get('Content-Type');
      if (res.ok && contentType === 'text/qwik-json-stream' && res.body) {
        return (async function* () {
          try {
            for await (const result of deserializeStream(res.body!, abortSignal)) {
              yield result;
            }
          } finally {
            if (!abortSignal?.aborted) {
              await res.body!.cancel();
            }
          }
        })();
      } else if (contentType === 'application/qwik-json') {
        const str = await res.text();
        const obj = _deserialize(str);
        if (res.status >= 400) {
          throw obj;
        }
        return obj;
      } else if (contentType === 'application/json') {
        const obj = await res.json();
        if (res.status >= 400) {
          throw obj;
        }
        return obj;
      } else if (contentType === 'text/plain' || contentType === 'text/html') {
        const str = await res.text();
        if (res.status >= 400) {
          throw str;
        }
        return str;
      }
    }
  }) as ServerQRL<T>;
};

/** @public */
export const server$ = /*#__PURE__*/ implicit$FirstArg(serverQrl);

const getValidators = (rest: (ActionOptions | DataValidator)[], qrl: QRL) => {
  let id: string | undefined;
  let invalidate: string[] | undefined;
  const validators: DataValidator[] = [];
  if (rest.length === 1) {
    const options = rest[0];
    if (options && typeof options === 'object') {
      if ('validate' in options) {
        validators.push(options);
      } else {
        id = options.id;
        if (options.validation) {
          validators.push(...options.validation);
        }
        if ((options as ActionOptions).invalidate) {
          invalidate = (options as ActionOptions).invalidate!.map(
            (loader: any) => loader.__id as string
          );
        }
      }
    }
  } else if (rest.length > 1) {
    validators.push(...(rest.filter((v) => !!v) as DataValidator[]));
  }

  if (typeof id === 'string') {
    if (isDev) {
      if (!/^[\w/.-]+$/.test(id)) {
        throw new Error(`Invalid id: ${id}, id can only contain [a-zA-Z0-9_.-]`);
      }
    }
    id = `id_${id}`;
  } else {
    id = qrl.getHash();
  }
  return {
    validators: validators.reverse(),
    id,
    invalidate,
  };
};

const deserializeStream = async function* (
  stream: ReadableStream<Uint8Array>,
  abortSignal?: AbortSignal
) {
  const reader = stream.getReader();
  try {
    let buffer = '';
    const decoder = new TextDecoder();
    while (!abortSignal?.aborted) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split(/\n/);
      buffer = lines.pop()!;
      for (const line of lines) {
        const deserializedData = _deserialize(line);
        yield deserializedData;
      }
    }
  } finally {
    reader.releaseLock();
  }
};
