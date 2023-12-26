/** @file Public APIs for the SSR */

import type { Container, ContainerElement, QNode, VNode as IVNode } from './types';

export function getContainer(element: HTMLElement): Container {
  const qElement = element as ContainerElement;
  let container = qElement.qContainer;
  if (!container) {
    qElement.qContainer = container = new QContainer(qElement);
  }
  return container;
}

export function getVNode(node: Node): IVNode {
  const qNode = node as QNode;
  let vNode = qNode.qVNode;
  if (!vNode) {
    vNode = qNode.qVNode = new VNode(qNode);
  }
  return vNode!;
}

class VNode implements IVNode {
  public node: QNode;
  public tag: string | Function;
  constructor(node: QNode) {
    this.node = node;
    this.tag = '';
  }
}

class QContainer implements Container {
  public element: ContainerElement;
  public qContainer: string;
  public qVersion: string;
  public qBase: string;
  public qLocale: string;
  public qManifestHash: string;
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
  }
}
