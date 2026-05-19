import { ContextId, useContext } from '@qwik.dev/core';
export const ID: ContextId<{ value: any }> = null!;

export const noUseSession = () => {
  return useContext(ID).value;
};

// Expect error: { "messageId": "useWrongFunction" }
