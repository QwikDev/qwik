import { logErrorAndStop } from '../util/log';
import { qDev } from '../util/qdev';

export function assertDefined<T>(value: T, text: string): asserts value is NonNullable<T> {
  if (qDev) {
    if (value != null) return;
    throw logErrorAndStop(text || 'Expected defined value');
  }
}

export function assertEqual(
  value1: any,
  value2: any,
  text: string
): asserts value1 is typeof value2 {
  if (qDev) {
    if (value1 === value2) return;
    throw logErrorAndStop(text || `Expected '${value1}' === '${value2}'.`);
  }
}

export function assertTrue(value1: any, text: string): asserts value1 is true {
  if (qDev) {
    if (value1 === true) return;
    throw logErrorAndStop(text || `Expected '${value1}' to be true.`);
  }
}
