import { createDocument } from '@builder.io/qwik/testing';
import { qRender, qEvent, qComponent, qHook, h, qBubble, useEvent } from '@builder.io/qwik';
import { trigger } from '../../testing/element_fixture';

describe('q-bubble', () => {
  let document: Document;
  let div: HTMLElement;
  beforeEach(() => {
    document = createDocument();
    div = document.createElement('div');
  });

  it('should bubble event to parent', async () => {
    const TestComp = qComponent<{ mark?: string }>({
      tagName: 'test',
      onRender: qHook(() => (
        <button on:click={qHook(() => qBubble(OnTest, { text: 'from-button' }))}></button>
      )),
    });
    let received!: string;
    await qRender(div, <TestComp {...OnTest(qHook(() => (received = useEvent(OnTest).text)))} />);
    await trigger(div, 'button', 'click');
    expect(received).toEqual('from-button');
  });
});

const OnTest = qEvent<{ text: string }>('test');
