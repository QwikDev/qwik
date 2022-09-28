import type { SubscriberSignal } from '../container';
import type { RenderStaticContext } from '../types';
import { setAttribute, setProperty } from './operations';

export const executeSignalOperation = (
  staticCtx: RenderStaticContext,
  operation: SubscriberSignal
) => {
  const value = operation[2].value;
  switch (operation[0]) {
    case 1:
      return setProperty(staticCtx, operation[3], operation[4], value);
    case 2:
      return setAttribute(staticCtx, operation[3], operation[4], value);
  }
};
