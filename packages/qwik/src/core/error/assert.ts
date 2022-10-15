import { logErrorAndStop } from '../util/log';
import { qDev } from '../util/qdev';

export function assertDefined<T>(
  value: T,
  text: string,
  ...parts: any[]
): asserts value is NonNullable<T> {
  if (qDev) {
    if (value != null) return;
    throw logErrorAndStop(text, ...parts);
  }
}

export function assertEqual(
  value1: any,
  value2: any,
  text: string,
  ...parts: any[]
): asserts value1 is typeof value2 {
  if (qDev) {
    if (value1 === value2) return;
    throw logErrorAndStop(text, ...parts);
  }
}

export function assertTrue(value1: any, text: string, ...parts: any[]): asserts value1 is true {
  if (qDev) {
    if (value1 === true) return;
    throw logErrorAndStop(text, ...parts);
  }
}

export function assertNumber(value1: any, text: string, ...parts: any[]): asserts value1 is number {
  if (qDev) {
    if (typeof value1 === 'number') return;
    throw logErrorAndStop(text, ...parts);
  }
}
