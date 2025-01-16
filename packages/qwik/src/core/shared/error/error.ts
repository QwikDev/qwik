import { logErrorAndStop } from '../utils/log';
import { qDev } from '../utils/qdev';

export const codeToText = (code: number, ...parts: any[]): string => {
  if (qDev) {
    // Keep one error, one line to make it easier to search for the error message.
    const MAP = [
      'Error while serializing class or style attributes', // 0
      '', // 1 unused
      '', // 2 unused
      'Only primitive and object literals can be serialized. {{0}}', // 3
      '', // 4 unused
      'You can render over a existing q:container. Skipping render().', // 5
      '', // 6 unused
      '', // 7 unused
      '', // 8 unused
      '', // 9 unused
      'QRL is not a function', // 10
      'Dynamic import not found', // 11
      'Unknown type argument', // 12
      `Actual value for useContext({{0}}) can not be found, make sure some ancestor component has set a value using useContextProvider(). In the browser make sure that the context was used during SSR so its state was serialized.`, // 13
      "Invoking 'use*()' method outside of invocation context.", // 14
      '', // 15 unused
      '', // 16 unused
      '', // 17 unused
      '', // 18 unused
      '', // 19 unused
      `Calling a 'use*()' method outside 'component$(() => { HERE })' is not allowed. 'use*()' methods provide hooks to the 'component$' state and lifecycle, ie 'use' hooks can only be called synchronously within the 'component$' function or another 'use' method.\nSee https://qwik.dev/docs/components/tasks/#use-method-rules`, // 20
      '', // 21 unused
      '', // 22 unused
      '', // 23 unused
      '', // 24 unused
      '', // 25 unused
      '', // 26 unused
      '', // 27 unused
      'The provided Context reference "{{0}}" is not a valid context created by createContextId()', // 28
      'SsrError(tag): {{0}}', // 29
      'QRLs can not be resolved because it does not have an attached container. This means that the QRL does not know where it belongs inside the DOM, so it cant dynamically import() from a relative path.', // 30
      'QRLs can not be dynamically resolved, because it does not have a chunk path', // 31
      '{{0}}\nThe JSX ref attribute must be a Signal', // 32
      'Serialization Error: Deserialization of data type {{0}} is not implemented', // 33
      'Serialization Error: Expected vnode for ref prop, but got {{0}}', // 34
      'Serialization Error: Cannot allocate data type {{0}}', // 35
      'Serialization Error: Missing root id for {{0}}', // 36
      'Serialization Error: Serialization of data type {{0}} is not implemented', // 37
      'Serialization Error: Unvisited {{0}}', // 38
      'Serialization Error: Missing QRL chunk for {{0}}', // 39
      '{{0}}\nThe value of the textarea must be a string found {{1}}', // 40
      'Unable to find q:container', // 41
      "Element must have 'q:container' attribute.", // 42
      'Unknown vnode type {{0}}.', // 43
      'Materialize error: missing element: {{0}} {{1}} {{2}}', // 44
      'SsrError: {{0}}', // 45
      'Cannot coerce a Signal, use `.value` instead', // 46
      'useComputedSignal$ QRL {{0}} {{1}} returned a Promise', // 47
      'ComputedSignal is read-only', // 48
      'WrappedSignal is read-only', // 49
      'SsrError: Promises not expected here.', // 50
      'Attribute value is unsafe for SSR', // 51
      'SerializerSymbol function returned rejected promise', // 52
    ];
    let text = MAP[code] ?? '';
    if (parts.length) {
      text = text.replaceAll(/{{(\d+)}}/g, (_, index) => {
        let v = parts[index];
        if (v && typeof v === 'object' && v.constructor === Object) {
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
  UNUSED_1 = 1,
  UNUSED_2 = 2,
  verifySerializable = 3,
  UNUSED_4 = 4,
  cannotRenderOverExistingContainer = 5,
  UNUSED_6 = 6,
  UNUSED_7 = 7,
  UNUSED_8 = 8,
  UNUSED_9 = 9,
  qrlIsNotFunction = 10,
  dynamicImportFailed = 11,
  unknownTypeArgument = 12,
  notFoundContext = 13,
  useMethodOutsideContext = 14,
  UNUSED_15 = 15,
  UNUSED_16 = 16,
  UNUSED_17 = 17,
  UNUSED_18 = 18,
  UNUSED_19 = 19,
  useInvokeContext = 20,
  UNUSED_21 = 21,
  UNUSED_22 = 22,
  UNUSED_23 = 23,
  UNUSED_24 = 24,
  UNUSED_25 = 25,
  UNUSED_26 = 26,
  UNUSED_27 = 27,
  invalidContext = 28,
  tagError = 29,
  qrlMissingContainer = 30,
  qrlMissingChunk = 31,
  invalidRefValue = 32,
  serializeErrorNotImplemented = 33,
  serializeErrorExpectedVNode = 34,
  serializeErrorCannotAllocate = 35,
  serializeErrorMissingRootId = 36,
  serializeErrorUnknownType = 37,
  serializeErrorUnvisited = 38,
  serializeErrorMissingChunk = 39,
  wrongTextareaValue = 40,
  containerNotFound = 41,
  elementWithoutContainer = 42,
  invalidVNodeType = 43,
  materializeVNodeDataError = 44,
  serverHostMismatch = 45,
  cannotCoerceSignal = 46,
  computedNotSync = 47,
  computedReadOnly = 48,
  wrappedReadOnly = 49,
  promisesNotExpected = 50,
  unsafeAttr = 51,
  serializerSymbolRejectedPromise = 52,
}

export const qError = (code: number, errorMessageArgs: any[] = []): Error => {
  const text = codeToText(code, ...errorMessageArgs);
  return logErrorAndStop(text, ...errorMessageArgs);
};
