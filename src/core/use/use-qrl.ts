import type { QRL } from '../import/qrl';
import { getInvokeContext } from './use-core';

export function useQRL(): QRL | null {
  return getInvokeContext().qrl || null;
}
