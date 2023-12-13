import { ContextId, useContext } from '@builder.io/qwik';
export const ID: ContextId<{ value: any }> = null!;

export function noUseSession() {
  useContext(ID);
}

// Expect error: { "messageId": "useWrongFunction" }
