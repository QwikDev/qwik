import { createDocument, MockDocument } from '@builder.io/qwik/testing';
import { isDomElementWithTagName } from './types';

describe('dom', () => {
  let doc: MockDocument;
  let div: HTMLElement;
  let span: HTMLElement;
  let text: Text;
  beforeEach(() => {
    doc = createDocument();
    div = doc.createElement('div');
    span = doc.createElement('span');
    text = doc.createTextNode('text-node');
  });

  it('isDomElementWithTagName', () => {
    expect(isDomElementWithTagName(null, 'dIv')).toEqual(false);
    expect(isDomElementWithTagName(span, 'dIv')).toEqual(false);
    expect(isDomElementWithTagName(text, 'dIv')).toEqual(false);
    expect(isDomElementWithTagName(div, 'dIv')).toEqual(true);
  });
});
