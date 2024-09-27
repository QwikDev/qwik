import { ContextId, useContext } from '@qwikdev/core';
export const ID: ContextId<{ value: any }> = null!;

export const noUseSession = () => {
  return useContext(ID).value;
};

// Expect error: { "messageId": "useWrongFunction" }
