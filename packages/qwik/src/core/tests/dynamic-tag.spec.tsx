import { component$, Slot, useStore, type Component } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

const Badge = component$(() => <em>badge</em>);
const Button = component$((props: { label: string }) => <button>{props.label}</button>);
const UI = { Button };

describe(`${name}: dynamic tags`, () => {
  it('renders a string tag from props with attributes and projected children', async () => {
    const Card = component$((props: { as: string }) => {
      const Tag = props.as;
      return (
        <Tag class="card">
          <Slot />
        </Tag>
      );
    });
    const App = component$(() => (
      <Card as="section">
        <b>inside</b>
      </Card>
    ));
    const { container, cleanup } = await render(App);
    try {
      expect(container.querySelector('section.card b')?.textContent).toBe('inside');
    } finally {
      cleanup();
    }
  });

  it('renders a component passed through props', async () => {
    const Host = component$((props: { component: Component }) => <props.component />);
    const App = component$(() => <Host component={Badge} />);
    const { container, cleanup } = await render(App);
    try {
      expect(container.querySelector('em')?.textContent).toBe('badge');
    } finally {
      cleanup();
    }
  });

  it('renders a member tag from a module object', async () => {
    const App = component$(() => <UI.Button label="press" />);
    const { container, cleanup } = await render(App);
    try {
      expect(container.querySelector('button')?.textContent).toBe('press');
    } finally {
      cleanup();
    }
  });

  it('re-renders a member tag when the value it reads changes', async () => {
    const App = component$(() => {
      const ui = useStore({ Tag: 'em' });
      return (
        <>
          <button onClick$={() => (ui.Tag = 'i')} />
          <ui.Tag>tag</ui.Tag>
        </>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      expect(container.querySelector('em')?.textContent).toBe('tag');
      await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(container.querySelector('em')).toBeFalsy();
      expect(container.querySelector('i')?.textContent).toBe('tag');
    } finally {
      cleanup();
    }
  });
});
