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
export function assertTrue(value1: any, text: string, ...parts: any[]): asserts value1 is true {
  if (isDev) {
    if (value1 === true) {
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
