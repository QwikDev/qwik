import { logErrorAndStop } from '../utils/log';
import { qDev } from '../utils/qdev';
import { isObject } from '../utils/types';

export const codeToText = (code: number, ...parts: any[]): string => {
  if (qDev) {
    // Keep one error, one line to make it easier to search for the error message.
    const MAP = [
      'Error while serializing class or style attributes', // 0
      'Scheduler not found', // 1
      'track() received object, without prop to track', // 2
      'Only primitive and object literals can be serialized. {{0}}', // 3
      'You can render over a existing q:container. Skipping render().', // 4
      'QRL is not a function', // 5
      'Dynamic import not found', // 6
      'Unknown type argument', // 7
      `Actual value for useContext({{0}}) can not be found, make sure some ancestor component has set a value using useContextProvider(). In the browser make sure that the context was used during SSR so its state was serialized.`, // 8
      "Invoking 'use*()' method outside of invocation context.", // 9
      `Calling a 'use*()' method outside 'component$(() => { HERE })' is not allowed. 'use*()' methods provide hooks to the 'component$' state and lifecycle, ie 'use' hooks can only be called synchronously within the 'component$' function or another 'use' method.\nSee https://qwik.dev/docs/core/tasks/#use-method-rules`, // 10
      'The provided Context reference "{{0}}" is not a valid context created by createContextId()', // 11
      'SsrError(tag): {{0}}', // 12
      'QRLs can not be resolved because it does not have an attached container. This means that the QRL does not know where it belongs inside the DOM, so it cant dynamically import() from a relative path.', // 13
      'QRLs can not be dynamically resolved, because it does not have a chunk path', // 14
      '{{0}}\nThe JSX ref attribute must be a Signal', // 15
      'Serialization Error: Deserialization of data type {{0}} is not implemented', // 16
      'Serialization Error: Expected vnode for ref prop, but got {{0}}', // 17
      'Serialization Error: Cannot allocate data type {{0}}', // 18
      'Serialization Error: Missing root id for {{0}}', // 19
      'Serialization Error: Serialization of data type {{0}} is not implemented', // 20
      'Serialization Error: Unvisited {{0}}', // 21
      'Serialization Error: Missing QRL chunk for {{0}}', // 22
      '{{0}}\nThe value of the textarea must be a string found {{1}}', // 23
      'Unable to find q:container', // 24
      "Element must have 'q:container' attribute.", // 25
      'Unknown vnode type {{0}}.', // 26
      'Materialize error: missing element: {{0}} {{1}} {{2}}', // 27
      'Cannot coerce a Signal, use `.value` instead', // 28
      'useComputed$ QRL {{0}} {{1}} cannot return a Promise', // 29
      'ComputedSignal is read-only', // 30
      'WrappedSignal is read-only', // 31
      'Attribute value is unsafe for SSR', // 32
      'SerializerSymbol function returned rejected promise', // 33
      'Serialization Error: Cannot serialize function: {{0}}', // 34
    ];
    let text = MAP[code] ?? '';
    if (parts.length) {
      text = text.replaceAll(/{{(\d+)}}/g, (_, index) => {
        let v = parts[index];
        if (v && isObject(v) && v.constructor === Object) {
          v = JSON.stringify(v).slice(0, 50);
        }
        return v;
      });
    }
    return `Code(Q${code}): ${text}`;
  } else {
    // cute little hack to give roughly the correct line number. Update the line number if it shifts.
    return `Code(Q${code}) https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/core/error/error.ts#L${8 + code}`;
  }
};

export const enum QError {
  stringifyClassOrStyle = 0,
  schedulerNotFound = 1,
  trackObjectWithoutProp = 2,
  verifySerializable = 3,
  cannotRenderOverExistingContainer = 4,
  qrlIsNotFunction = 5,
  dynamicImportFailed = 6,
  unknownTypeArgument = 7,
  notFoundContext = 8,
  useMethodOutsideContext = 9,
  useInvokeContext = 10,
  invalidContext = 11,
  tagError = 12,
  qrlMissingContainer = 13,
  qrlMissingChunk = 14,
  invalidRefValue = 15,
  serializeErrorNotImplemented = 16,
  serializeErrorExpectedVNode = 17,
  serializeErrorCannotAllocate = 18,
  serializeErrorMissingRootId = 19,
  serializeErrorUnknownType = 20,
  serializeErrorUnvisited = 21,
  serializeErrorMissingChunk = 22,
  wrongTextareaValue = 23,
  containerNotFound = 24,
  elementWithoutContainer = 25,
  invalidVNodeType = 26,
  materializeVNodeDataError = 27,
  cannotCoerceSignal = 28,
  computedNotSync = 29,
  computedReadOnly = 30,
  wrappedReadOnly = 31,
  unsafeAttr = 32,
  serializerSymbolRejectedPromise = 33,
  serializeErrorCannotSerializeFunction = 34,
}

export const qError = (code: number, errorMessageArgs: any[] = []): Error => {
  const text = codeToText(code, ...errorMessageArgs);
  return logErrorAndStop(text, ...errorMessageArgs);
};
