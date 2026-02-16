import { isDev } from '@qwik.dev/core/build';
import { throwErrorAndStop } from '../utils/log';

const ASSERT_DISCLAIMER = 'Internal assert, this is likely caused by a bug in Qwik: ';

/*@__INLINE__*/
export function assertDefined<T>(
  value: T,
  text: string,
  ...parts: any[]
): asserts value is NonNullable<T> {
  if (isDev) {
    if (value != null) {
      return;
    }
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}

/*@__INLINE__*/
export function assertEqual(
  value1: any,
  value2: any,
  text: string,
  ...parts: any[]
): asserts value1 is typeof value2 {
  if (isDev) {
    if (value1 === value2) {
      return;
    }
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}

/*@__INLINE__*/
export function assertFail(text: string, ...parts: any[]): never;
export function assertFail(text: string, ...parts: any[]) {
  if (isDev) {
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}

/*@__INLINE__*/
export function assertTrue(value1: any, text: string, ...parts: any[]): asserts value1 is true {
  if (isDev) {
    if (value1 === true) {
      return;
    }
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}

/*@__INLINE__*/
export function assertFalse(value1: any, text: string, ...parts: any[]): asserts value1 is false {
  if (isDev) {
    if (value1 === false) {
      return;
    }
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}

/*@__INLINE__*/
export function assertNumber(value1: any, text: string, ...parts: any[]): asserts value1 is number {
  if (isDev) {
    if (typeof value1 === 'number') {
      return;
    }
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}

/*@__INLINE__*/
export function assertString(value1: any, text: string, ...parts: any[]): asserts value1 is string {
  if (isDev) {
    if (typeof value1 === 'string') {
      return;
    }
    throwErrorAndStop(ASSERT_DISCLAIMER + text, ...parts);
  }
}
