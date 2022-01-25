import { qImport } from '../import/qImport';
import { QRL, toQrlOrError } from '../import/qrl';
import type { qrlFactory } from '../props/q-props-on';
import { qProps } from '../props/q-props.public';
import { h } from '../render/jsx/factory';
import type { JSXNode } from '../render/jsx/types/jsx-node';
import { newInvokeContext, useInvoke, useWaitOn } from '../use/use-core';
import { useHostElement } from '../use/use-host-element.public';
import { AttributeMarker } from '../util/markers';
import { styleKey } from './qrl-styles';

/**
 * @public
 */
export type TypeOrQRL<T> = QRL<T> | T;

/**
 * @public
 */
export function onUnmount(unmountFn: TypeOrQRL<() => void>): QRL<() => void> {
  throw new Error('IMPLEMENT: onUnmount' + unmountFn);
}

/**
 * @public
 */
export function onResume(resumeFn: TypeOrQRL<() => void>): QRL<() => void> {
  throw new Error('IMPLEMENT: onRender' + resumeFn);
}

/**
 * @public
 */
export function onHalt(haltFn: TypeOrQRL<() => void>): QRL<() => void> {
  throw new Error('IMPLEMENT: onRender' + haltFn);
}

/**
 * @public
 */
export function onHydrate(hydrateFn: TypeOrQRL<() => void>): QRL<() => void> {
  throw new Error('IMPLEMENT: onHydrate' + hydrateFn);
}

/**
 * @public
 */
export function onDehydrate(dehydrateFn: TypeOrQRL<() => void>): QRL<() => void> {
  throw new Error('IMPLEMENT: onDehydrate' + dehydrateFn);
}

/**
 * @public
 */
export function onRender(renderFn: TypeOrQRL<() => JSXNode>): QRL<() => JSXNode> {
  return toQrlOrError(renderFn);
}

/**
 * @public
 */
export function on(event: string, eventFn: TypeOrQRL<() => void>): QRL<() => void> {
  throw new Error('IMPLEMENT: on' + eventFn);
}

/**
 * @public
 */
export function onDocument(event: string, eventFn: TypeOrQRL<() => void>): QRL<() => void> {
  throw new Error('IMPLEMENT: onDocument' + eventFn);
}

/**
 * @public
 */
export function onWindow(event: string, eventFn: TypeOrQRL<() => void>): QRL<() => void> {
  throw new Error('IMPLEMENT: onWindow' + eventFn);
}

/**
 * @public
 */
export function withStyles(styles: TypeOrQRL<string>): void {
  _withStyles(styles, false);
}

/**
 * @public
 */
export function withScopedStyles(styles: TypeOrQRL<string>): void {
  _withStyles(styles, true);
}

type OnMountFn<PROPS> = (props: PROPS) => ReturnType<typeof onRender>;

/**
 * @public
 */
export type PropsOf<COMP extends (props: any) => JSXNode> = COMP extends (
  props: infer PROPS
) => JSXNode<any>
  ? PROPS
  : never;

/**
 * @public
 */
export function qComponent<PROPS extends {}>(
  tagName: string,
  onMount: TypeOrQRL<(props: PROPS) => ReturnType<typeof onRender>>
): (props: PROPS) => JSXNode<PROPS>;
/**
 * @public
 */
export function qComponent<PROPS extends {}>(
  onMount: TypeOrQRL<(props: PROPS) => ReturnType<typeof onRender>>
): (props: PROPS) => JSXNode<PROPS>;
/**
 * @public
 */
export function qComponent<PROPS extends {}>(
  tagNameOrONMount: string | TypeOrQRL<OnMountFn<PROPS>>,
  onMount?: TypeOrQRL<OnMountFn<PROPS>>
): (props: PROPS) => JSXNode<PROPS> {
  // Sort of the argument position based on type / overload
  const hasTagName = typeof tagNameOrONMount == 'string';
  const tagName = hasTagName ? tagNameOrONMount : 'div';
  const onMount_ = hasTagName ? onMount! : tagNameOrONMount;

  // Return a QComponent Factory function.
  return function QComponent(props: PROPS): JSXNode<PROPS> {
    const onRenderFactory: qrlFactory = async (
      hostElement: Element
    ): Promise<ReturnType<typeof onRender>> => {
      // Turn function into QRL
      const onMountQrl = toQrlOrError(onMount_);
      const onMount = await resolveQrl(hostElement, onMountQrl);
      const componentProps = Object.assign(qProps(hostElement), props);
      const invokeCtx = newInvokeContext(hostElement);
      return useInvoke(invokeCtx, onMount, componentProps);
    };
    return h(tagName, { 'on:qRender': onRenderFactory, ...props }) as any;
  };
}

function resolveQrl<PROPS extends {}>(
  hostElement: Element,
  onMountQrl: QRL<OnMountFn<PROPS>>
): Promise<OnMountFn<PROPS>> {
  return onMountQrl.symbolRef
    ? Promise.resolve(onMountQrl.symbolRef!)
    : Promise.resolve(null).then(() => {
        return qImport<OnMountFn<PROPS>>(hostElement, onMountQrl);
      });
}

function _withStyles(styles: TypeOrQRL<string>, scoped: boolean) {
  const styleQrl = toQrlOrError(styles);
  const styleId = styleKey(styleQrl);
  const hostElement = useHostElement();
  if (scoped) {
    hostElement.setAttribute(AttributeMarker.ComponentScopedStyles, styleId);
  }

  useWaitOn(
    qImport(hostElement, styleQrl).then((styleText) => {
      const document = hostElement.ownerDocument;
      const head = document.querySelector('head');
      if (head && !head.querySelector(`style[q\\:style="${styleId}"]`)) {
        const style = document.createElement('style');
        style.setAttribute('q:style', styleId);
        style.textContent = scoped ? styleText.replace(/�/g, styleId) : styleText;
        head.appendChild(style);
      }
    })
  );
}
