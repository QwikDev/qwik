import { ContextId, useContext } from '@qwik.dev/core';
export const ID: ContextId<{ value: any }> = null!;

export function noUseSession() {
  useContext(ID);
}

// Expect error: { "messageId": "useWrongFunction" }
