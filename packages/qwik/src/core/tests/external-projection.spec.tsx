import { $, component$ } from '@qwik.dev/core';
import { domRender } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { _addProjection, _slotReady, _updateProjectionProps, _removeProjection } from '../internal';
import { waitForDrain } from '../../testing/util';

const DEBUG = false;

describe('external-projection (CSR)', () => {
  it('should add a projection child that renders into a target element', async () => {
    // A simple child component that renders its title prop
    const childQrl = $((props: { title: string }) => {
      return <span>{props.title}</span>;
    });

    // A parent component that just renders a div
    const Parent = component$(() => {
      return <div id="parent">parent content</div>;
    });

    const { document, container, vNode } = await domRender(<Parent />, { debug: DEBUG });

    // Get the parent component's VNode (first child of root is the Parent component)
    const parentVNode = vNode;
    expect(parentVNode).toBeDefined();

    // Create a target element in the DOM (simulating what React would create)
    const targetEl = document.createElement('div');
    targetEl.setAttribute('data-qwik-projection', 'test-slot');
    document.body.appendChild(targetEl);

    // Add the projection
    const projectionVNode = _addProjection(
      container,
      parentVNode as any,
      childQrl,
      { title: 'hello from projection' },
      '_rq:test'
    );

    expect(projectionVNode).toBeDefined();

    // Set the target element (simulating React's ref callback)
    _slotReady(projectionVNode, targetEl);

    // Wait for the cursor walker to process the new VNode
    await waitForDrain(container);

    // The child component should have rendered into the target element
    expect(targetEl.innerHTML).toContain('hello from projection');
  });

  it('should update projection props', async () => {
    const childQrl = $((props: { title: string }) => {
      return <span>{props.title}</span>;
    });

    const Parent = component$(() => {
      return <div id="parent">parent content</div>;
    });

    const { document, container, vNode } = await domRender(<Parent />, { debug: DEBUG });

    const parentVNode = vNode;

    const targetEl = document.createElement('div');
    document.body.appendChild(targetEl);

    const projectionVNode = _addProjection(
      container,
      parentVNode as any,
      childQrl,
      { title: 'initial' },
      '_rq:update-test'
    );

    _slotReady(projectionVNode, targetEl);
    await waitForDrain(container);

    expect(targetEl.innerHTML).toContain('initial');

    // Update props
    _updateProjectionProps(container, projectionVNode, { title: 'updated' });
    await waitForDrain(container);

    expect(targetEl.innerHTML).toContain('updated');
  });

  it('should remove projection and clean up target element', async () => {
    const childQrl = $((props: { title: string }) => {
      return <span>{props.title}</span>;
    });

    const Parent = component$(() => {
      return <div id="parent">parent content</div>;
    });

    const { document, container, vNode } = await domRender(<Parent />, { debug: DEBUG });

    const parentVNode = vNode;

    const targetEl = document.createElement('div');
    document.body.appendChild(targetEl);

    const slotName = '_rq:remove-test';
    const projectionVNode = _addProjection(
      container,
      parentVNode as any,
      childQrl,
      { title: 'to be removed' },
      slotName
    );

    _slotReady(projectionVNode, targetEl);
    await waitForDrain(container);

    expect(targetEl.innerHTML).toContain('to be removed');

    // Remove the projection
    _removeProjection(container, parentVNode as any, projectionVNode, slotName);

    // Target element should be cleared
    expect(targetEl.innerHTML).toBe('');
  });
});
