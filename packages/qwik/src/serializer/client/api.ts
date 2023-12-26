/** @file Public APIs for the SSR */

import type { Container, ContainerElement, QNode, VNode as IVNode } from './types';
import { VNode, vnode_new } from './vnode';

export function getContainer(element: HTMLElement): Container {
  const qElement = element as ContainerElement;
  let container = qElement.qContainer;
  if (!container) {
    qElement.qContainer = container = new QContainer(qElement);
  }
  return container;
}

class QContainer implements Container {
  public element: ContainerElement;
  public qContainer: string;
  public qVersion: string;
  public qBase: string;
  public qLocale: string;
  public qManifestHash: string;
  public rootVNode: VNode;
  constructor(element: ContainerElement) {
    this.qContainer = element.getAttribute('q:container')!;
    if (!this.qContainer) {
      throw new Error("Element must have 'q:version' attribute.");
    }
    this.qVersion = element.getAttribute('q:version')!;
    this.qBase = element.getAttribute('q:base')!;
    this.qLocale = element.getAttribute('q:locale')!;
    this.qManifestHash = element.getAttribute('q:manifest-hash')!;
    this.element = element;
    this.rootVNode = vnode_new(this.element);
  }
}
