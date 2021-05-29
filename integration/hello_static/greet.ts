/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

export function click(element: Element) {
  const parent = element.parentElement!;
  const input = parent.querySelector('input') as HTMLInputElement;
  const name = input.value;

  alert('Hello ' + name + '!');
}

export function keyup(element: HTMLInputElement) {
  const name = element.value;
  const span = element.parentElement!.querySelector('span')!;
  span.textContent = name;
}
