import { createDocument } from '@builder.io/qwik/testing';
import { qRender, qComponent, h, qBubble, onRender } from '@builder.io/qwik';
import { trigger } from '../../testing/element_fixture';
import { useEvent } from '../use/use.event.public';
import { runtimeQrl } from '../import/qrl';

describe('q-bubble', () => {
  let document: Document;
  let div: HTMLElement;
  beforeEach(() => {
    document = createDocument();
    div = document.createElement('div');
  });

  it('should bubble event to parent', async () => {
    const TestComp = qComponent('test', () => {
      return onRender(() => (
        <button on:click={runtimeQrl(() => qBubble('test', { text: 'from-button' }))}></button>
      ));
    });
    let received!: string;
    await qRender(
      div,
      <TestComp on:test={runtimeQrl(() => (received = useEvent<{ text: string }>().text))} />
    );
    await trigger(div, 'button', 'click');
    expect(received).toEqual('from-button');
  });
});
