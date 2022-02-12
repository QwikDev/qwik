import { createDocument } from '@builder.io/qwik/testing';
import { render, component$, bubble, onRender$ } from '@builder.io/qwik';
import { trigger } from '../../testing/element_fixture';
import { useEvent } from '../use/use-event.public';
import { runtimeQrl } from '../import/qrl';

describe('q-bubble', () => {
  let document: Document;
  let div: HTMLElement;
  beforeEach(() => {
    document = createDocument();
    div = document.createElement('div');
  });

  it('should bubble event to parent', async () => {
    const TestComp = component$(
      () => {
        return onRender$(() => (
          <button on:click={runtimeQrl(() => bubble('test', { text: 'from-button' }))}></button>
        ));
      },
      {
        tagName: 'test',
      }
    );
    let received!: string;
    await render(
      div,
      <TestComp on:test={runtimeQrl(() => (received = useEvent<{ text: string }>().text))} />
    );
    await trigger(div, 'button', 'click');
    expect(received).toEqual('from-button');
  });
});
