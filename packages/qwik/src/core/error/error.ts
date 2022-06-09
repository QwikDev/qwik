import { qDev } from '../util/qdev';

export const QError_stringifyClassOrStyle = 0;
export const QError_cannotSerializeNode = 1; // 'Can not serialize a HTML Node that is not an Element'
export const QError_runtimeQrlNoElement = 2; // `Q-ERROR: '${qrl}' is runtime but no instance found on element.`
export const QError_verifySerializable = 3; // 'Only primitive and object literals can be serialized', value,
export const QError_errorWhileRendering = 4; // Crash while rendering
export const QError_cannotRenderOverExistingContainer = 5; //'You can render over a existing q:container. Skipping render().'
export const QError_setProperty = 6; //'Set property'
export const QError_qrlOrError = 7;
export const QError_onlyObjectWrapped = 8;
export const QError_onlyLiteralWrapped = 9;
export const QError_qrlIsNotFunction = 10;
export const QError_dynamicImportFailed = 11;
export const QError_unknownTypeArgument = 12;
export const QError_notFoundContext = 13;
export const QError_useMethodOutsideContext = 14;
export const QError_missingRenderCtx = 15;
export const QError_missingDoc = 16;
export const QError_immutableProps = 17;

export const qError = (code: number, ...parts: any[]): Error => {
  const text = codeToText(code);
  const error = text + parts.join(' ');
  debugger; // eslint-disable-line no-debugger
  return new Error(error);
};

export const codeToText = (code: number): string => {
  if (qDev) {
    const MAP = [
      'Can not serialize a HTML Node that is not an Element',
      'Rruntime but no instance found on element.',
      'Only primitive and object literals can be serialized',
      'Crash while rendering',
      'You can render over a existing q:container. Skipping render().',
      'Set property',
      "Only function's and 'string's are supported.",
      "Only objects can be wrapped in 'QObject'",
      `Only objects literals can be wrapped in 'QObject'`,
      'QRL is not a function',
      'Dynamic import not found',
      'Unknown type argument',
      'not found state for useContext',
      "Q-ERROR: invoking 'use*()' method outside of invocation context.",
      'Cant access renderCtx for existing context',
      'Cant access document for existing context',
      'props are inmutable',
    ];
    return `Code(${code}): ${MAP[code] ?? ''}`;
  } else {
    return `Code(${code})`;
  }
};
