import type { Signal } from "../../object/q-object";
import type { Subscriber } from "../../use/use-watch";
import { isArray } from "../../util/types";
import type { RenderStaticContext } from "../types";
import { setAttribute, setProperty } from "./operations";
import type { QwikElement } from "./virtual-element";

type RenderHostElement = [hostEl: QwikElement];
type RenderSetProperty = [hostEl: QwikElement, signal: Signal, id: 0, elm: QwikElement | Node, prop: string];
type RenderSetAttribute = [hostEl: QwikElement, signal: Signal, id: 1, elm: QwikElement, attribute: string];

export type SubscriberSignal = RenderSetProperty | RenderSetAttribute;
export type SubscriberRender = RenderHostElement | SubscriberSignal;

export const isSignalOperation = (subscriber: Subscriber): subscriber is SubscriberRender => {
  return isArray(subscriber);
}

export const executeSignalOperation = (staticCtx: RenderStaticContext, operation: SubscriberSignal) => {
  const value = operation[1].untrackedValue;
  switch (operation[2]) {
    case 0:
      return setProperty(staticCtx, operation[3], operation[4], value);
    case 1:
      return setAttribute(staticCtx, operation[3], operation[4], value);
  }
}