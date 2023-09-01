import type { QwikElement, VirtualElement } from '../render/dom/virtual-element';
import { isElement, isQwikElement } from '../util/element';
import { throwErrorAndStop } from '../util/log';
import { qDev } from '../util/qdev';

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

export function assertQwikElement(el: any): asserts el is QwikElement {
  if (qDev) {
    if (!isQwikElement(el)) {
      console.error('Not a Qwik Element, got', el);
      throwErrorAndStop(ASSERT_DISCLAIMER + 'Not a Qwik Element');
    }
  }
}

export function assertElement(el: Node | VirtualElement): asserts el is Element {
  if (qDev) {
    if (!isElement(el)) {
      console.error('Not a Element, got', el);
      throwErrorAndStop(ASSERT_DISCLAIMER + 'Not an Element');
    }
  }
}
