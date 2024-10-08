import { throwErrorAndStop } from '../utils/log';
import { qDev } from '../utils/qdev';

const ASSERT_DISCLAIMER = 'Internal assert, this is likely caused by a bug in Qwik: ';

export function assertDefined<T>(
  value: T,
  text: string,
  ...parts: any[]
): asserts value is NonNullable<T> {
  if (qDev) {
    if (value != null) {
      return;
    }
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}

export function assertEqual(
  value1: any,
  value2: any,
  text: string,
  ...parts: any[]
): asserts value1 is typeof value2 {
  if (qDev) {
    if (value1 === value2) {
      return;
    }
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}

export function assertFail(text: string, ...parts: any[]): never;
export function assertFail(text: string, ...parts: any[]) {
  if (qDev) {
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}

export function assertTrue(value1: any, text: string, ...parts: any[]): asserts value1 is true {
  if (qDev) {
    if (value1 === true) {
      return;
    }
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}

export function assertFalse(value1: any, text: string, ...parts: any[]): asserts value1 is true {
  if (qDev) {
    if (value1 === false) {
      return;
    }
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}

export function assertNumber(value1: any, text: string, ...parts: any[]): asserts value1 is number {
  if (qDev) {
    if (typeof value1 === 'number') {
      return;
    }
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}

export function assertString(value1: any, text: string, ...parts: any[]): asserts value1 is string {
  if (qDev) {
    if (typeof value1 === 'string') {
      return;
    }
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}
