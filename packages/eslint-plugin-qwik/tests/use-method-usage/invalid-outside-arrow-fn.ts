import { ContextId, useContext } from '@qwikdev/core';
export const ID: ContextId<{ value: any }> = null!;

export const noUseSession = () => {
  useContext(ID);
};

// Expect error: { "messageId": "useWrongFunction" }
