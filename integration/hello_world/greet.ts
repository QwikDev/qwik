/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { InjectionContext } from 'qoot';

export function click(context: InjectionContext) {
  const element = context.element!;
  const parent = element.parentElement!;
  const input = parent.querySelector('input') as HTMLInputElement;
  const name = input.value;

  alert('Hello ' + name + '!');
}

export function keydown(context: InjectionContext) {
  const element = context.element as HTMLInputElement;

  const name = element.value;
  const span = element.parentElement?.querySelector('span')!;
  span.textContent = name;
}
