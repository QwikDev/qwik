import { $, component$, useTask$ } from '@qwik.dev/core';
import { domRender } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import {
  _addProjection,
  _setProjectionTarget,
  _updateProjectionProps,
  _removeProjection,
} from '../internal';
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
    _setProjectionTarget(projectionVNode, targetEl);

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

    _setProjectionTarget(projectionVNode, targetEl);
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

    _setProjectionTarget(projectionVNode, targetEl);
    await waitForDrain(container);

    expect(targetEl.innerHTML).toContain('to be removed');

    // Remove the projection
    _removeProjection(container, parentVNode as any, projectionVNode, slotName);

    // Target element should be cleared
    expect(targetEl.innerHTML).toBe('');
  });

  it('should clean up effects when projection is removed', async () => {
    const log: string[] = [];

    const childQrl = $((props: { title: string }) => {
      useTask$(() => {
        log.push('task');
        return () => {
          log.push('cleanup');
        };
      });
      return <span>{props.title}</span>;
    });

    const Parent = component$(() => {
      return <div id="parent">parent content</div>;
    });

    const { document, container, vNode } = await domRender(<Parent />, { debug: DEBUG });

    const parentVNode = vNode;

    const targetEl = document.createElement('div');
    document.body.appendChild(targetEl);

    const slotName = '_rq:cleanup-test';
    const projectionVNode = _addProjection(
      container,
      parentVNode as any,
      childQrl,
      { title: 'with effects' },
      slotName
    );

    _setProjectionTarget(projectionVNode, targetEl);
    await waitForDrain(container);

    expect(targetEl.innerHTML).toContain('with effects');
    expect(log).toEqual(['task']);

    // Remove the projection — should trigger task cleanup
    _removeProjection(container, parentVNode as any, projectionVNode, slotName);
    await waitForDrain(container);

    expect(targetEl.innerHTML).toBe('');
    expect(log).toEqual(['task', 'cleanup']);
  });
});
