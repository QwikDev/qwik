import type { Ref as RefType } from './q-render.public';

export class Ref implements RefType {
  current: Element | undefined = undefined;
  onRender: ((element: Element) => any | Promise<any>) | undefined;
  constructor(onRender?: (element: Element) => any | Promise<any>) {
    this.onRender = onRender;
  }
}

export function isRef(value: any): value is Ref {
  return value instanceof Ref;
}
