import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';

import { _createDocument } from '../../server/document';
import type { StreamWriter } from '../../server/types';
import { component$ } from '../component/component.public';
import { delay } from '../util/promises';
import { Host } from './jsx/host.public';
import { renderSSR } from './render-ssr';

const renderSSRSuite  =suite('renderSSR');
renderSSRSuite('render attributes', async () => {
  await testSSR(<div
    id='stuff'
    aria-required='true'
    role=''
  ></div>, '<div id="stuff" aria-required="true" role></div>');
});

renderSSRSuite('render className', async () => {
  await testSSR(<div
    className='stuff'
  ></div>, '<div class="stuff"></div>');
});

renderSSRSuite('render class', async () => {
  await testSSR(<div
    class={{
      'stuff': true,
      'other': false
    }}
  ></div>, '<div class="stuff"></div>');
});

renderSSRSuite('render contentEditable', async () => {
  await testSSR(<div
    contentEditable="true"
  ></div>, '<div contenteditable="true"></div>');
});

renderSSRSuite('self closing elements', async () => {
  await testSSR(<input></input>, '<input/>');
});

renderSSRSuite('single simple children', async () => {
  await testSSR(<div>hola</div>, '<div>hola</div>');
  await testSSR(<div>{2}</div>, '<div>2</div>');
  await testSSR(<div>{true}</div>, '<div></div>');
  await testSSR(<div>{false}</div>, '<div></div>');
  await testSSR(<div>{null}</div>, '<div></div>');
  await testSSR(<div>{undefined}</div>, '<div></div>');
});

renderSSRSuite('single complex children', async () => {
  await testSSR(<div><p>hola</p></div>, '<div><p>hola</p></div>');
  await testSSR(<div>hola {2}<p>hola</p></div>, '<div>hola 2<p>hola</p></div>');
});

renderSSRSuite('single multiple children', async () => {
  await testSSR(<ul>
    <li>1</li>
    <li>2</li>
    <li>3</li>
    <li>4</li>
    <li>5</li>
    <li>6</li>
    <li>7</li>
    <li>8</li>
  </ul>, '<ul><li>1</li><li>2</li><li>3</li><li>4</li><li>5</li><li>6</li><li>7</li><li>8</li></ul>');
});


renderSSRSuite('using fragment', async () => {
  await testSSR(<ul>
    <>
      <li>1</li>
      <li>2</li>
    </>
    <li>3</li>
    <>
      <li>4</li>
      <>
        <li>5</li>
        <>
          <>
            <li>6</li>
          </>
        </>
      </>
      <li>7</li>
    </>
    <li>8</li>
  </ul>, '<ul><li>1</li><li>2</li><li>3</li><li>4</li><li>5</li><li>6</li><li>7</li><li>8</li></ul>');
});
renderSSRSuite.run();

renderSSRSuite('using promises', async () => {
  await testSSR(<div>{Promise.resolve('hola')}</div>, '<div>hola</div>');
  await testSSR(<div>{Promise.resolve(<p>hola</p>)}</div>, '<div><p>hola</p></div>');

  await testSSR(<ul>
    {Promise.resolve(<li>1</li>)}
    {delay(100).then(() => <li>2</li>)}
    {delay(10).then(() => <li>3</li>)}
  </ul>, [
    "<ul",
    ">",
    "<li",
    ">",
    "1",
    "</li>",
    "<li",
    ">",
    "2",
    "</li>",
    "<li",
    ">",
    "3",
    "</li>",
    "</ul>"
  ]);
});

renderSSRSuite('using component', async () => {
  await testSSR(<MyCmp/>, '<section q:key="s0:" class="my-cmp" q:host><div>MyCmp{}</div></section>');
});

renderSSRSuite('using component props', async () => {
  await testSSR(<MyCmp
    id="12"
    host:prop="attribute"
    prop="12" />, '<section id="12" prop="attribute" q:key="s0:" class="my-cmp" q:host><div>MyCmp{"prop":"12"}</div></section>');
});


renderSSRSuite('using component project content', async () => {
  await testSSR(<MyCmp><div>slot</div></MyCmp>, '<section q:key="s0:" class="my-cmp" q:host><div>MyCmp{}</div><q:template><div>slot</div></q:template></section>');
});

renderSSRSuite.run();

export const MyCmp = component$((props: Record<string, any>) => {
  return (
    <Host class="my-cmp">
      <div>
        MyCmp
        {JSON.stringify(props)}
      </div>
    </Host>
  );
}, {
  tagName: 'section'
});

async function testSSR(node: JSXNode, expected: string | string[]) {
  const doc = _createDocument() as Document;
  const chunks: string[] = [];
  const stream: StreamWriter = {
    write(chunk) {
      chunks.push(chunk)
    }
  };
  await renderSSR(doc, node, {

    stream,
  });
  if (typeof expected === 'string') {
    equal(chunks.join(''), expected);
  } else {
    equal(chunks, expected);
  }
}