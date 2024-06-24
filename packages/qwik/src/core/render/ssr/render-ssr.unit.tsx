import { format } from 'prettier';

import { expect, test, vi } from 'vitest';
import type { StreamWriter } from '../../../server/types';
import { component$ } from '../../component/component.public';
import { inlinedQrl } from '../../qrl/qrl';
import { $ } from '../../qrl/qrl.public';
import { createContextId, useContext, useContextProvider } from '../../use/use-context';
import { useOn, useOnDocument, useOnWindow } from '../../use/use-on';
import { Resource, useResource$ } from '../../use/use-resource';
import { useSignal } from '../../use/use-signal';
import { useStore } from '../../use/use-store.public';
import { useStylesQrl, useStylesScopedQrl } from '../../use/use-styles';
import { useTask$, useVisibleTask$ } from '../../use/use-task';
import { delay } from '../../util/promises';
import { HTMLFragment, jsx } from '../jsx/jsx-runtime';
import { Slot } from '../jsx/slot.public';
import type { JSXOutput } from '../jsx/types/jsx-node';
import { SSRComment, SSRRaw } from '../jsx/utils.public';
import { _renderSSR, type RenderSSROptions } from './render-ssr';

test('render attributes', async () => {
  await testSSR(
    <body id="stuff" aria-required="true" role=""></body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body id="stuff" aria-required="true" role=""></body></html>'
  );
});

test('render aria value', async () => {
  await testSSR(
    <body
      id="stuff"
      aria-required={true}
      aria-busy={false}
      role=""
      preventdefault:click
      aria-hidden={undefined}
    ></body>,
    `
        <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
          <body id="stuff" aria-required="true" aria-busy="false" role="" preventdefault:click></body>
        </html>
        `
  );
});

test('render className', async () => {
  await testSSR(
    <body class="stuff"></body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body class="stuff"></body></html>'
  );
});

test('should not allow div inside p', async () => {
  await throws(async () => {
    await testSSR(
      <body>
        <p>
          <div></div>
        </p>
      </body>,
      ''
    );
  });
  await throws(async () => {
    await testSSR(
      <body>
        <p>
          <span>
            <div></div>
          </span>
        </p>
      </body>,
      ''
    );
  });
});

test('should not allow button inside button', async () => {
  await throws(async () => {
    await testSSR(
      <body>
        <button>
          <button></button>
        </button>
      </body>,
      ''
    );
  });
  await throws(async () => {
    await testSSR(
      <body>
        <button>
          <span>
            <button></button>
          </span>
        </button>
      </body>,
      ''
    );
  });
});

test('should not allow a inside a', async () => {
  await throws(async () => {
    await testSSR(
      <body>
        <a>
          <a></a>
        </a>
      </body>,
      ''
    );
  });
  await throws(async () => {
    await testSSR(
      <body>
        <a>
          <span>
            <a></a>
          </span>
        </a>
      </body>,
      ''
    );
  });
});

test('should not allow div inside html', async () => {
  await throws(async () => {
    await testSSR(<div></div>, '');
  });
});

test('should not allow div inside head', async () => {
  await throws(async () => {
    await testSSR(
      <head>
        <div></div>
      </head>,
      ''
    );
  });
});

test('render class', async () => {
  await testSSR(
    <body
      class={{
        stuff: true,
        other: false,
        'm-0 p-2': true,
      }}
    ></body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body class="stuff m-0 p-2"></body></html>'
  );

  const Test = component$(() => {
    // Extra spaces to ensure signal hasn't changed
    const sigClass = useSignal(' myClass ');
    return <div class={sigClass} />;
  });
  await testSSR(
    <body>
      <Test />
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <!--qv q:id=0 q:key=sX:-->
        <div class="myClass" q:id="1"></div>
        <!--/qv-->
      </body>
    </html>`
  );

  await testSSR(
    <body
      class={['stuff', '', 'm-0 p-2', null, { active: 1 }, undefined, [{ container: 'yup' }]]}
    ></body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body class="stuff m-0 p-2 active container"></body>
    </html>`
  );
});

test('render contentEditable', async () => {
  await testSSR(
    <body contentEditable="true"></body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body contentEditable="true"></body></html>'
  );
});

test('render draggable', async () => {
  await testSSR(
    <body>
      <div draggable={true}></div>
      <div draggable={false}></div>
      <div draggable={undefined}></div>
    </body>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <div draggable="true"></div>
        <div draggable="false"></div>
        <div></div>
      </body>
    </html>
    `
  );
});

test('render <textarea>', async () => {
  await testSSR(
    <body>
      <textarea value="some text"></textarea>
    </body>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <textarea>some text</textarea>
      </body>
    </html>
    `
  );
});

test('render spellcheck', async () => {
  await testSSR(
    <body>
      <div spellcheck={true}></div>
      <div spellcheck={false}></div>
      <div spellcheck={undefined}></div>
    </body>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <div spellcheck="true"></div>
        <div spellcheck="false"></div>
        <div></div>
      </body>
    </html>
    `
  );
});

test('render styles', async () => {
  await testSSR(
    <body
      style={{
        'padding-top': '10px',
        paddingBottom: '10px',
        top: 0,
        '--stuff-nu': -1,
        '--stuff-hey': 'hey',
        '--stuffCase': 'foo',
      }}
    ></body>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body style="
          padding-top: 10px;
          padding-bottom: 10px;
          top: 0;
          --stuff-nu: -1;
          --stuff-hey: hey;
          --stuffCase: foo;
        "
      ></body>
    </html>`
  );
});

test('render fake click handler', async () => {
  const Div = 'body' as any;
  await testSSR(
    <Div on:click="true" onScroll="text"></Div>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body on:click="true" onScroll="text"></body>
    </html>`
  );
});

test('self closing elements', async () => {
  await testSSR(
    <body>
      <input></input>
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <input>
      </body>
    </html>`
  );
});

test('single simple children', async () => {
  await testSSR(
    <body>hola</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body>hola</body></html>'
  );
  await testSSR(
    <body>{0}</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body>0</body></html>'
  );
  await testSSR(
    <body>{true}</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body></body></html>'
  );
  await testSSR(
    <body>{false}</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body></body></html>'
  );
  await testSSR(
    <body>{null}</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body></body></html>'
  );
  await testSSR(
    <body>{undefined}</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body></body></html>'
  );
});

test('valid phrasing content', async () => {
  await testSSR(
    <body>
      <p>
        <del>Del</del>
      </p>
    </body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body><p><del>Del</del></p></body>'
  );
  await testSSR(
    <body>
      <p>
        <select>
          <option>A</option>
          <option>B</option>
        </select>
      </p>
    </body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body><p><select><option>A</option><option>B</option></select></p></body>'
  );
  await testSSR(
    <body>
      <p>
        <link rel="example" />
      </p>
    </body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body><p><link rel="example"/></p></body>'
  );
  await testSSR(
    <body>
      <p>
        <map name="my-map">
          <area shape="poly" coords="0,0,10,10,10,0" href="/example" alt="Example" />
        </map>
        <img useMap="#my-map" src="/example.png" alt="Example" />
      </p>
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <p>
          <map name="my-map">
            <area shape="poly" coords="0,0,10,10,10,0" href="/example" alt="Example">
          </map>
          <img usemap="#my-map" src="/example.png" alt="Example">
        </p>
        </body>
      </html>`
  );
  await testSSR(
    <body>
      <p>
        <svg
          viewBox="0 0 10 10"
          xmlns="http://www.w3.org/2000/svg"
          xmlns:xlink="http://www.w3.org/1999/xlink"
        >
          <path d="M 0 0 L 10 10"></path>
          <circle cx="5" cy="5" rx="5" ry="5"></circle>
        </svg>
      </p>
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <p>
          <svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <path d="M 0 0 L 10 10"></path>
            <circle cx="5" cy="5" rx="5" ry="5"></circle>
          </svg>
        </p>
      </body>
    </html>`
  );
  await testSSR(
    <body>
      <p>
        <math>
          <semantics>
            <mrow>
              <mi>2</mi>
              <mo>+</mo>
              <mi>2</mi>
            </mrow>
          </semantics>
        </math>
      </p>
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <p>
          <math>
            <semantics>
              <mrow>
                <mi>2</mi>
                <mo>+</mo>
                <mi>2</mi>
              </mrow>
            </semantics>
          </math>
        </p>
      </body>
    </html>`
  );
});

test('events', async () => {
  await testSSR(
    <body onClick$={() => console.warn('hol')}>hola</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body on:click="/runtimeQRL#_">hola</body></html>'
  );
  await testSSR(
    <body onClick$={[undefined, $(() => console.warn('hol'))]}>hola</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body on:click="/runtimeQRL#_">hola</body></html>'
  );
  await testSSR(
    <body onClick$={[undefined, [$(() => console.warn('hol'))]]}>hola</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body on:click="/runtimeQRL#_">hola</body></html>'
  );
  await testSSR(
    <body document:onClick$={() => console.warn('hol')}>hola</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body on-document:click="/runtimeQRL#_">hola</body></html>'
  );
  await testSSR(
    <body window:onClick$={() => console.warn('hol')}>hola</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body on-window:click="/runtimeQRL#_">hola</body></html>'
  );
  await testSSR(
    <body>
      <input onInput$={() => console.warn('hol')} />
    </body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body><input on:input="/runtimeQRL#_"></body></html>'
  );
});

test('innerHTML', async () => {
  await testSSR(
    <body dangerouslySetInnerHTML="<p>hola</p>"></body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body><p>hola</p></body></html>'
  );
  await testSSR(
    <body dangerouslySetInnerHTML=""></body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body></body></html>'
  );
  const Div = 'body' as any;
  await testSSR(
    <Div dangerouslySetInnerHTML={0}></Div>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body>0</body></html>'
  );
  await testSSR(
    <body>
      <script dangerouslySetInnerHTML="() => null"></script>
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <script>
          () => null
        </script>
      </body>
    </html>`
  );
});

test('single complex children', async () => {
  await testSSR(
    <div>
      <p>hola</p>
    </div>,
    '<container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦"><div><p>hola</p></div></container>',
    {
      containerTagName: 'container',
    }
  );
  await testSSR(
    <div>
      hola {2}
      <p>hola</p>
    </div>,
    '<container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦"><div>hola 2<p>hola</p></div></container>',
    {
      containerTagName: 'container',
    }
  );
});

test('single multiple children', async () => {
  await testSSR(
    <ul>
      <li>1</li>
      <li>2</li>
      <li>3</li>
      <li>4</li>
      <li>5</li>
      <li>6</li>
      <li>7</li>
      <li>8</li>
    </ul>,
    '<container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦"><ul><li>1</li><li>2</li><li>3</li><li>4</li><li>5</li><li>6</li><li>7</li><li>8</li></ul></container>',
    {
      containerTagName: 'container',
    }
  );
});

test('sanity', async () => {
  await testSSR(
    <body>
      <div>{`.rule > thing{}`}</div>
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <div>.rule &gt; thing{}</div>
      </body>
    </html>`
  );
});

test('using fragment', async () => {
  await testSSR(
    <ul>
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
    </ul>,
    '<container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦"><ul><li>1</li><li>2</li><li>3</li><li>4</li><li>5</li><li>6</li><li>7</li><li>8</li></ul></container>',
    {
      containerTagName: 'container',
    }
  );
});

test('using promises', async () => {
  await testSSR(
    <body>{Promise.resolve('hola')}</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body><!--qkssr-f-->hola</body></html>'
  );
  await testSSR(
    <body>{Promise.resolve(<p>hola</p>)}</body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body><!--qkssr-f--><p>hola</p></body></html>'
  );

  await testSSR(
    <ul>
      {Promise.resolve(<li>1</li>)}
      <li>2</li>
      {delay(100).then(() => (
        <li>3</li>
      ))}
      {delay(10).then(() => (
        <li>4</li>
      ))}
    </ul>,
    [
      '<container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦">',
      '<ul>',
      '<!--qkssr-f-->',
      '<li>',
      '1',
      '</li>',
      '<li>',
      '2',
      '</li>',
      '<!--qkssr-f-->',
      '<li>',
      '3',
      '</li>',
      '<!--qkssr-f-->',
      '<li>',
      '4',
      '</li>',
      '</ul>',
      '</container>',
    ],
    {
      containerTagName: 'container',
    }
  );
});

test('mixed children', async () => {
  await testSSR(
    <ul>
      <li>0</li>
      <li>1</li>
      <li>2</li>
      {Promise.resolve(<li>3</li>)}
      <li>4</li>
      {delay(100).then(() => (
        <li>5</li>
      ))}
      {delay(10).then(() => (
        <li>6</li>
      ))}
    </ul>,
    `
        <container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦">
        <ul>
        <li>0</li>
        <li>1</li>
        <li>2</li>
        <!--qkssr-f-->
        <li>3</li>
        <li>4</li>
        <!--qkssr-f-->
        <li>5</li>
        <!--qkssr-f-->
        <li>6</li>
        </ul>
        </container>`,
    {
      containerTagName: 'container',
    }
  );
});

test('DelayResource', async () => {
  await testSSR(
    <body>
      <ul>
        <DelayResource text="thing" delay={100} />
        <DelayResource text="thing" delay={10} />
      </ul>
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
    <body>
      <ul>
        <!--qv q:id=0 q:key=sX:-->
          <style q:style="fio5tb-0" hidden>.cmp {background: blue}</style>
          <div class="cmp"><!--qkssr-f--><span>thing</span></div>
        <!--/qv-->
        <!--qv q:id=1 q:key=sX:-->
          <div class="cmp"><!--qkssr-f--><span>thing</span></div>
        <!--/qv-->
      </ul>
    </body>
  </html>`
  );
});

test('using promises with DelayResource', async () => {
  await testSSR(
    <body>
      <ul>
        {delay(10).then(() => (
          <li>thing</li>
        ))}
        <DelayResource text="thing" delay={500} />
      </ul>
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
      <ul>
        <!--qkssr-f-->
        <li>thing</li>
        <!--qv q:id=0 q:key=sX:-->
          <style q:style="fio5tb-0" hidden>.cmp {background: blue}</style>
          <div class="cmp"><!--qkssr-f--><span>thing</span></div>
        <!--/qv-->
      </ul>
      </body>
    </html>`
  );
});

test('using component', async () => {
  await testSSR(
    <MyCmp />,
    `<container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦">
      <!--qv q:id=0 q:key=sX:-->
      <section><div>MyCmp{}</div></section>
      <!--/qv-->
    </container>`,
    {
      containerTagName: 'container',
    }
  );
});

test('using component with key', async () => {
  await testSSR(
    <body>
      <MyCmp key="hola" />
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <!--qv q:id=0 q:key=sX:hola-->
        <section><div>MyCmp{}</div></section>
        <!--/qv-->
      </body>
    </html>`
  );
});

test('using element with key', async () => {
  await testSSR(
    <body>
      <div key="hola" />
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <div q:key="hola"></div>
      </body>
    </html>`
  );
});

test('using element with key containing double quotes', async () => {
  await testSSR(
    <body>
      <div key={'"hola"'} />
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <div q:key="&quot;hola&quot;"></div>
      </body>
    </html>`
  );
});

test('using component props', async () => {
  await testSSR(
    <MyCmp
      id="12"
      host:prop="attribute"
      innerHTML="123"
      dangerouslySetInnerHTML="432"
      onClick="lazy.js"
      prop="12"
      q:slot="name"
    >
      stuff
    </MyCmp>,
    `
    <container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦">
      <!--qv q:id=0 q:key=sX:-->
      <section>
        <div>MyCmp{&quot;id&quot;:&quot;12&quot;,&quot;host:prop&quot;:&quot;attribute&quot;,&quot;innerHTML&quot;:&quot;123&quot;,&quot;dangerouslySetInnerHTML&quot;:&quot;432&quot;,&quot;onClick&quot;:&quot;lazy.js&quot;,&quot;prop&quot;:&quot;12&quot;}</div>
      </section>
      <q:template q:slot hidden aria-hidden="true">stuff</q:template>
      <!--/qv-->
    </container>
    `,
    {
      containerTagName: 'container',
    }
  );
});

test('using component project content', async () => {
  await testSSR(
    <MyCmp>
      <div>slot</div>
    </MyCmp>,
    `
  <container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦">
    <!--qv q:id=0 q:key=sX:-->
    <section><div>MyCmp{}</div></section>
    <q:template q:slot hidden aria-hidden="true"><div>slot</div></q:template>
    <!--/qv-->
  </container>
`,
    {
      containerTagName: 'container',
    }
  );
});

test('using complex component', async () => {
  await testSSR(
    <body>
      <MyCmpComplex></MyCmpComplex>
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <!--qv q:id=0 q:key=sX:-->
        <div on:click="/runtimeQRL#_" q:id="1">
          <button on:click="/runtimeQRL#_">Click</button>
          <!--qv q:s q:sref=0 q:key=--><!--/qv-->
        </div>
        <!--/qv-->
      </body>
    </html>`
  );
});

test('using complex component with slot', async () => {
  await testSSR(
    <MyCmpComplex>Hola</MyCmpComplex>,
    `
    <container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦">
      <!--qv q:id=0 q:key=sX:-->
      <div on:click="/runtimeQRL#_" q:id="1">
        <button on:click="/runtimeQRL#_">Click</button>
        <!--qv q:s q:sref=0 q:key=-->
        Hola
        <!--/qv-->
      </div>
      <!--/qv-->
    </container>`,
    {
      containerTagName: 'container',
    }
  );
});

test('<head>', async () => {
  await testSSR(
    <head>
      <title>hola</title>
      <>
        <meta></meta>
      </>
    </head>,
    `
  <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
    <head q:head>
      <title q:head>hola</title>
      <meta q:head>
    </head>
  </html>`
  );
});

test('named slots', async () => {
  await testSSR(
    <NamedSlot>
      Text
      <div q:slot="start">START: 1</div>
      <>
        <div q:slot="end">END: 1</div>
        from
        <div q:slot="start">START: 2</div>
      </>
      <div q:slot="end">END: 2</div>
      default
    </NamedSlot>,
    `
    <container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦">
      <!--qv q:id=0 q:key=sX:-->
      <div>
        <!--qv q:s q:sref=0 q:key=start-->
        <div q:slot="start">START: 1</div>
        <div q:slot="start">START: 2</div>
        <!--/qv-->
        <div><!--qv q:s q:sref=0 q:key=-->Textfromdefault<!--/qv--></div>
        <!--qv q:s q:sref=0 q:key=end-->
        <div q:slot="end">END: 1</div>
        <div q:slot="end">END: 2</div>
        <!--/qv-->
      </div>
      <!--/qv-->
    </container>
`,
    {
      containerTagName: 'container',
    }
  );
});

test('nested slots', async () => {
  await testSSR(
    <SimpleSlot name="root">
      <SimpleSlot name="level 1">
        <SimpleSlot name="level 2">
          BEFORE CONTENT
          <div>Content</div>
          AFTER CONTENT
        </SimpleSlot>
      </SimpleSlot>
    </SimpleSlot>,
    `
    <container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦">
      <!--qv q:id=0 q:key=sX:-->
        <div id="root">
          Before root
          <!--qv q:s q:sref=0 q:key=-->
            <!--qv q:id=1 q:key=sX:-->
            <div id="level 1">
              Before level 1
              <!--qv q:s q:sref=1 q:key=-->
                <!--qv q:id=2 q:key=sX:-->
                  <div id="level 2">
                    Before level 2
                    <!--qv q:s q:sref=2 q:key=-->
                      BEFORE CONTENT
                      <div>Content</div>
                      AFTER CONTENT
                    <!--/qv-->
                    After level 2
                  </div>
                <!--/qv-->
              <!--/qv-->
              After level 1
            </div>
            <!--/qv-->
          <!--/qv-->
          After root
        </div>
      <!--/qv-->
    </container>`,
    {
      containerTagName: 'container',
    }
  );
});

test('mixes slots', async () => {
  await testSSR(
    <MixedSlot>Content</MixedSlot>,
    `
    <container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦">
      <!--qv q:id=0 q:key=sX:-->
      <!--qv q:id=1 q:key=sX:-->
        <div id="1">Before 1
        <!--qv q:s q:sref=1 q:key=-->
          <!--qv q:s q:sref=0 q:key=-->
            Content
          <!--/qv-->
        <!--/qv-->
        After 1
      </div>
      <!--/qv-->
      <!--/qv-->
    </container>`,
    {
      containerTagName: 'container',
    }
  );
});

test('component RenderSignals()', async () => {
  vi.spyOn(console, 'warn');
  await testSSR(
    <RenderSignals />,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <!--qv q:id=0 q:key=sX:-->
      <head q:head>
        <title q:head>value</title>
        <style q:head>
          value
        </style>
        <script q:head>
          value
        </script>
      </head>
      <!--/qv-->
    </html>`
  );
  expect(console.warn).toHaveBeenCalledTimes(2);
});

test('component useContextProvider()', async () => {
  await testSSR(
    <Context>
      <ContextConsumer />
    </Context>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <!--qv q:id=0 q:key=sX:-->
        <!--qv q:s q:sref=0 q:key=-->
          <!--qv q:id=1 q:key=sX:-->hello bye<!--/qv-->
        <!--/qv-->
        <!--qv q:id=2 q:key=sX:-->hello bye<!--/qv-->
      <!--/qv-->
    </html>`
  );
});

test('component useContextProvider() + useContext()', async () => {
  await testSSR(
    <ContextWithValueAndUse value="hello bye" />,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <!--qv q:id=0 q:key=sX:-->hello bye<!--/qv-->
    </html>`
  );
});

test('component slotted context', async () => {
  await testSSR(
    <body>
      <VariadicContext>
        <ReadValue />
        <ReadValue q:slot="start" />
        <ReadValue q:slot="end" />
      </VariadicContext>
    </body>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <!--qv q:id=0 q:key=sX:-->
        <!--qv q:id=1 q:key=sX:-->
        <!--qv q:s q:sref=1 q:key=-->
        <!--qv q:s q:sref=0 q:key=start-->
        <!--qv q:id=2 q:key=sX:-->
        <span>start</span>
        <!--/qv-->
        <!--/qv-->
        <!--/qv-->
        <!--/qv-->
        <!--qv q:id=3 q:key=sX:-->
        <!--qv q:s q:sref=3 q:key=-->
        <!--qv q:s q:sref=0 q:key=-->
        <!--qv q:id=4 q:key=sX:-->
        <span>default</span>
        <!--/qv-->
        <!--/qv-->
        <!--/qv-->
        <!--/qv-->
        <!--qv q:id=5 q:key=sX:-->
        <!--qv q:s q:sref=5 q:key=-->
        <!--qv q:s q:sref=0 q:key=end-->
        <!--qv q:id=6 q:key=sX:-->
        <span>end</span>
        <!--/qv-->
        <!--/qv-->
        <!--/qv-->
        <!--/qv-->
        <!--/qv-->
      </body>
    </html>`
  );
});

test('component useOn()', async () => {
  await testSSR(
    <body>
      <Events />
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
      <!--qv q:id=0 q:key=sX:-->
      <div on:click="/runtimeQRL#_\n/runtimeQRL#_" on-window:click="/runtimeQRL#_" on-document:click="/runtimeQRL#_"></div>
      <!--/qv-->
      </body>
    </html>`
  );
});

test('component useOn([array])', async () => {
  await testSSR(
    <body>
      <UseOnMultiple />
    </body>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <!--qv q:id=0 q:key=sX:-->
        <div on:click="/runtimeQRL#_\n/runtimeQRL#_"
          on:scroll="/runtimeQRL#_"
          on-window:click="/runtimeQRL#_"
          on-window:scroll="/runtimeQRL#_"
          on-document:click="/runtimeQRL#_"
          on-document:scroll="/runtimeQRL#_"
        ></div>
        <!--/qv-->
      </body>
    </html>`
  );
});

test('component useStyles()', async () => {
  await testSSR(
    <>
      <body>
        <Styles />
      </body>
    </>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <!--qv q:id=0 q:key=sX:-->
          <style q:style="17nc-0" hidden>.host {color: red}</style>
          <div class="host">
            Text
          </div>
        <!--/qv-->
      </body>
    </html>`
  );
});

test('component useStylesScoped()', async () => {
  await testSSR(
    <>
      <body>
        <ScopedStyles1>
          <div>projected</div>
        </ScopedStyles1>
      </body>
    </>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <!--qv q:sstyle=⭐️1d-0|⭐️1e-1 q:id=0 q:key=sX:-->
        <style q:style="1d-0" hidden>
          .host.⭐️1d-0 {
            color: red;
          }
        </style>
        <style q:style="1e-1" hidden>
          .blue.⭐️1e-1 {
            color: blue;
          }
        </style>
        <div class="⭐️1d-0 ⭐️1e-1 host">
          <div class="⭐️1d-0 ⭐️1e-1 div">
            Scoped1
            <!--qv q:s q:sref=0 q:key=-->
            <div>projected</div>
            <!--/qv-->
            <p class="⭐️1d-0 ⭐️1e-1">Que tal?</p>
          </div>
          <!--qv q:sstyle=⭐️f0gmsw-0 q:id=1 q:key=sX:-->
          <style q:style="f0gmsw-0" hidden>
            .host.⭐️f0gmsw-0 {
              color: blue;
            }
          </style>
          <div class="⭐️f0gmsw-0 host">
            <div class="⭐️f0gmsw-0">
              Scoped2
              <p class="⭐️f0gmsw-0">Bien</p>
            </div>
          </div>
          <!--/qv-->
          <!--qv q:sstyle=⭐️f0gmsw-0 q:id=2 q:key=sX:-->
          <div class="⭐️f0gmsw-0 host">
            <div class="⭐️f0gmsw-0">
              Scoped2
              <p class="⭐️f0gmsw-0">Bien</p>
            </div>
          </div>
          <!--/qv-->
        </div>
        <!--/qv-->
      </body>
    </html>
    `
  );
});

test('component useStylesScoped() + slot', async () => {
  await testSSR(
    <>
      <RootStyles></RootStyles>
    </>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <!--qv q:sstyle=⭐️lkei4s-0 q:id=0 q:key=sX:-->
      <body class="⭐️lkei4s-0">
        <!--qv q:sstyle=⭐️tdblg1-0 q:id=1 q:key=sX:-->
        <style q:style="tdblg1-0" hidden>
          .host.⭐️tdblg1-0 {
            background: green;
          }
        </style>
        <div class="⭐️tdblg1-0">
          <!--qv q:s q:sref=1 q:key=one-->
          <div q:slot="one" class="⭐️lkei4s-0">One</div>
          <!--/qv-->
        </div>
        <q:template q:slot="two" hidden aria-hidden="true" class="⭐️lkei4s-0">
          <div q:slot="two" class="⭐️lkei4s-0">Two</div>
        </q:template>
        <!--/qv-->
      </body>
      <!--/qv-->
    </html>
    `
  );
});

test('component useBrowserVisibleTask()', async () => {
  await testSSR(
    <UseClientEffect />,
    `<container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class="qc📦">
      <!--qv q:id=0 q:key=sX:-->
        <div on:qvisible="/runtimeQRL#_[0]
/runtimeQRL#_[1]" q:id="1"></div>
      <!--/qv-->
    </container>`,
    {
      containerTagName: 'container',
    }
  );
});

test('component useBrowserVisibleTask() without elements', async () => {
  await testSSR(
    <body>
      <UseEmptyClientEffect />
    </body>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <!--qv q:id=0 q:key=sX:-->
        Hola
        <script type="placeholder" hidden q:id="1" on-document:qinit="/runtimeQRL#_[0]\n/runtimeQRL#_[1]"></script>
        <!--/qv-->
      </body>
    </html>
    `
  );
});

test('component useBrowserVisibleTask() inside <head>', async () => {
  await testSSR(
    <head>
      <UseEmptyClientEffect />
      <UseClientEffect as="style" />
    </head>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <head q:head>
        <!--qv q:id=0 q:key=sX:-->
        Hola
        <script type="placeholder" hidden q:id="1" on-document:qinit="/runtimeQRL#_[0]\n/runtimeQRL#_[1]"></script>
        <!--/qv-->
        <!--qv q:id=2 q:key=sX:-->
        <style on-document:qinit="/runtimeQRL#_[0]\n/runtimeQRL#_[1]" q:id="3" q:head></style>
        <!--/qv-->
      </head>
    </html>`
  );
});

test('nested html', async () => {
  await testSSR(
    <>
      <body></body>
    </>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body></body></html>`
  );
});

test('root html component', async () => {
  await testSSR(
    <HeadCmp host:aria-hidden="true">
      <link></link>
    </HeadCmp>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <!--qv q:id=0 q:key=sX:-->
      <head on-document:qinit="/runtimeQRL#_[0]" q:id="1" q:head>
        <title q:head>hola</title>
        <!--qv q:s q:sref=0 q:key=-->
        <link q:head />
        <!--/qv-->
      </head>
      <!--/qv-->
    </html>
    `
  );
});

test('containerTagName', async () => {
  await testSSR(
    <>
      <Styles />
      <UseClientEffect></UseClientEffect>
      <section></section>
    </>,
    `<container q:container="paused" q:version="dev" q:render="ssr-dev" q:base="/manu/folder" q:manifest-hash="test" class="qc📦">
      <link rel="stylesheet" href="/global.css">
      <!--qv q:id=0 q:key=sX:-->
        <style q:style="17nc-0" hidden>.host {color: red}</style>
        <div class="host">Text</div>
      <!--/qv-->
      <!--qv q:id=1 q:key=sX:-->
        <div on:qvisible="/runtimeQRL#_[0]
/runtimeQRL#_[1]" q:id="2"></div>
      <!--/qv-->
      <section></section>
    </container>`,
    {
      containerTagName: 'container',
      base: '/manu/folder',
      beforeContent: [jsx('link', { rel: 'stylesheet', href: '/global.css' })],
    }
  );
});

test('containerAttributes', async () => {
  await testSSR(
    <>
      <body></body>
    </>,
    `
    <html prefix="something" q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
     <body></body>
    </html>
    `,
    {
      containerAttributes: {
        prefix: 'something',
      },
    }
  );
  await testSSR(
    <>
      <div></div>
    </>,
    `
    <app prefix="something" q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test" class='qc📦 thing'>
     <div></div>
    </app>
    `,
    {
      containerTagName: 'app',
      containerAttributes: {
        prefix: 'something',
        class: 'thing',
      },
    }
  );
});

test('custom q:render', async () => {
  await testSSR(
    <>
      <body></body>
    </>,
    `
    <html q:render="static-ssr-dev" q:container="paused" q:version="dev" q:base="" q:manifest-hash="test">
     <body></body>
    </html>
    `,
    {
      containerAttributes: {
        'q:render': 'static',
      },
    }
  );
  await testSSR(
    <>
      <body></body>
    </>,
    `
    <html q:render="ssr-dev" q:container="paused" q:version="dev" q:base="" q:manifest-hash="test">
     <body></body>
    </html>
    `,
    {
      containerAttributes: {
        'q:render': '',
      },
    }
  );
});

test('ssr marks', async () => {
  await testSSR(
    <body>
      {delay(100).then(() => (
        <li>1</li>
      ))}
      {delay(10).then(() => (
        <li>2</li>
      ))}
      <SSRComment data="here" />
      <div>
        <SSRComment data="i am" />
      </div>
      {delay(120).then(() => (
        <li>3</li>
      ))}
    </body>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <!--qkssr-f-->
        <li>1</li>
        <!--qkssr-f-->
        <li>2</li>
        <!--here-->
        <div>
          <!--i am-->
        </div>
        <!--qkssr-f-->
        <li>3</li>
      </body>
    </html>`
  );
});

test('ssr raw', async () => {
  await testSSR(
    <body>
      <SSRRaw data="<div>hello</div>" />
    </body>,
    `
  <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
    <body>
      <div>hello</div>
    </body>
  </html>`
  );
});

test('html fragment', async () => {
  await testSSR(
    <body>
      <HTMLFragment dangerouslySetInnerHTML="<div>hello</div>" />
    </body>,
    `
  <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
    <body>
      <!--qv-->
      <div>hello</div>
      <!--/qv-->
    </body>
  </html>`
  );
});

test('html slot', async () => {
  await testSSR(
    <HtmlContext>
      <head>
        <meta charset="utf-8" />
        <title>Qwik</title>
      </head>
      <body>
        <div></div>
      </body>
    </HtmlContext>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="/manu/folder" q:manifest-hash="test">
      <!--qv q:id=0 q:key=sX:-->
      <!--qv q:s q:sref=0 q:key=-->
      <head q:head>
        <meta charset="utf-8" q:head />
        <title q:head>Qwik</title>
        <link rel="stylesheet" href="/global.css" />
        <style q:style="fio5tb-1" hidden>
          body {
            background: blue;
          }
        </style>
      </head>
      <body>
        <div></div>
      </body>
      <!--/qv-->
      <!--/qv-->
    </html>`,
    {
      beforeContent: [jsx('link', { rel: 'stylesheet', href: '/global.css' })],
      base: '/manu/folder',
    }
  );
});

test('null component', async () => {
  await testSSR(
    <>
      <NullCmp />
    </>,
    `<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><!--qv q:id=0 q:key=sX:--><!--/qv--></html>`
  );
});

test('cleanse attribute name', async () => {
  const o = {
    '"><script>alert("ಠ~ಠ")</script>': 'xss',
  };
  await testSSR(
    <body {...o}></body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body></body></html>'
  );
});

test('cleanse class attribute', async () => {
  const o = {
    class: '"><script>alert("ಠ~ಠ")</script>',
  };
  await testSSR(
    <body {...o}></body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body class="&quot;&gt;&lt;script&gt;alert(&quot;ಠ~ಠ&quot;)&lt;/script&gt;"></body></html>'
  );
});

test('class emoji valid', async () => {
  const o = {
    class: 'package📦',
  };
  await testSSR(
    <body {...o}></body>,
    '<html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test"><body class="package📦"></body></html>'
  );
});

test('issue 4283', async () => {
  await testSSR(
    <body>
      <Issue4283>
        <p>index page</p>
      </Issue4283>
    </body>,
    `
    <html q:container="paused" q:version="dev" q:render="ssr-dev" q:base="" q:manifest-hash="test">
      <body>
        <!--qv q:id=0 q:key=sX:-->
        <!--qv q:id=1 q:key=sX:-->
        <div on:qvisible="/runtimeQRL#_[0]" q:id="2"></div>
        <q:template q:slot hidden aria-hidden="true">
          <p>Content</p>
          <!--qv q:s q:sref=0 q:key=-->
          <p>index page</p>
          <!--/qv-->
        </q:template>
        <!--/qv-->
        <!--/qv-->
      </body>
    </html>
    `
  );
});

// TODO
// Merge props on host
// - host events
// - class
// - style
// Container with tagName
// End-to-end with qwikcity
// SVG rendering
// Performance metrics

export const MyCmp = component$((props: Record<string, any>) => {
  return (
    <section>
      <div>
        MyCmp
        {JSON.stringify(props)}
      </div>
    </section>
  );
});

export const MyCmpComplex = component$(() => {
  const ref = useSignal<HTMLElement>();
  return (
    <div ref={ref} onClick$={() => console.warn('from component')}>
      <button onClick$={() => console.warn('click')}>Click</button>
      <Slot></Slot>
    </div>
  );
});

export const SimpleSlot = component$((props: { name: string }) => {
  return (
    <div id={props.name}>
      Before {props.name}
      <Slot></Slot>
      After {props.name}
    </div>
  );
});

export const MixedSlot = component$(() => {
  return (
    <SimpleSlot name="1">
      <Slot />
    </SimpleSlot>
  );
});

export const NamedSlot = component$(() => {
  return (
    <div>
      <Slot name="start" />
      <div>
        <Slot></Slot>
      </div>
      <Slot name="end" />
    </div>
  );
});

export const Events = component$(() => {
  useOn(
    'click',
    $(() => console.warn('click'))
  );
  useOnWindow(
    'click',
    $(() => console.warn('window:click'))
  );
  useOnDocument(
    'click',
    $(() => console.warn('document:click'))
  );

  return <div onClick$={() => console.warn('scroll')}></div>;
});

export const UseOnMultiple = component$(() => {
  useOn(
    ['click', 'scroll'],
    $(() => console.warn('click or scroll'))
  );
  useOnWindow(
    ['click', 'scroll'],
    $(() => console.warn('window:click or scroll'))
  );
  useOnDocument(
    ['click', 'scroll'],
    $(() => console.warn('document:click or scroll'))
  );

  return <div onClick$={() => console.warn('scroll')}></div>;
});

export const Styles = component$(() => {
  useStylesQrl(inlinedQrl('.host {color: red}', 'styles_987'));

  return <div class="host">Text</div>;
});

export const ScopedStyles1 = component$(() => {
  useStylesScopedQrl(inlinedQrl('.host {color: red}', 'styles_scoped_1'));
  useStylesScopedQrl(inlinedQrl('.blue {color: blue}', 'styles_scoped_2'));

  return (
    <div class="host">
      <div class="div">
        Scoped1
        <Slot></Slot>
        <p>Que tal?</p>
      </div>
      <ScopedStyles2 />
      <ScopedStyles2 />
    </div>
  );
});

export const ScopedStyles2 = component$(() => {
  useStylesScopedQrl(inlinedQrl('.host {color: blue}', '20_styles_scoped'));

  return (
    <div class="host">
      <div>
        Scoped2
        <p>Bien</p>
      </div>
    </div>
  );
});

export const RootStyles = component$(() => {
  useStylesScopedQrl(inlinedQrl('.host {background: blue}', '20_stylesscopedblue'));

  return (
    <body>
      <ComponentA>
        <div q:slot="one">One</div>
        <div q:slot="two">Two</div>
      </ComponentA>
    </body>
  );
});

export const ComponentA = component$(() => {
  useStylesScopedQrl(inlinedQrl('.host {background: green}', '20_stylesscopedgreen'));

  return (
    <div>
      <Slot name="one" />
    </div>
  );
});

const CTX_INTERNAL = createContextId<{ value: string }>('internal');
const CTX_QWIK_CITY = createContextId<{ value: string }>('qwikcity');
const CTX_VALUE = createContextId<{ value: string }>('value');

export const VariadicContext = component$(() => {
  return (
    <>
      <ContextWithValue value="start">
        <Slot name="start"></Slot>
      </ContextWithValue>
      <ContextWithValue value="default">
        <Slot></Slot>
      </ContextWithValue>
      <ContextWithValue value="end">
        <Slot name="end"></Slot>
      </ContextWithValue>
    </>
  );
});

export const ReadValue = component$(() => {
  const ctx = useContext(CTX_VALUE);
  return <span>{ctx.value}</span>;
});

export const ContextWithValue = component$((props: { value: string }) => {
  const value = {
    value: props.value,
  };
  useContextProvider(CTX_VALUE, value);
  return (
    <>
      <Slot />
    </>
  );
});

export const ContextWithValueAndUse = component$((props: { value: string }) => {
  const value = {
    value: props.value,
  };
  useContextProvider(CTX_VALUE, value);
  const ctx = useContext(CTX_VALUE);
  return <>{ctx.value}</>;
});

export const Context = component$(() => {
  useContextProvider(CTX_INTERNAL, {
    value: 'hello',
  });
  useContextProvider(CTX_QWIK_CITY, {
    value: 'bye',
  });
  return (
    <>
      <Slot />
      <ContextConsumer />
    </>
  );
});

export const ContextConsumer = component$(() => {
  const internal = useContext(CTX_INTERNAL);
  const qwikCity = useContext(CTX_QWIK_CITY);

  return (
    <>
      {internal.value} {qwikCity.value}
    </>
  );
});

export const UseClientEffect = component$((props: any) => {
  useVisibleTask$(() => {
    console.warn('client effect');
  });
  useVisibleTask$(() => {
    console.warn('second client effect');
  });
  useTask$(async () => {
    await delay(10);
  });

  const Div = props.as ?? 'div';
  return <Div />;
});

export const UseEmptyClientEffect = component$(() => {
  useVisibleTask$(() => {
    console.warn('client effect');
  });
  useVisibleTask$(() => {
    console.warn('second client effect');
  });
  useTask$(async () => {
    await delay(10);
  });

  return <>Hola</>;
});

export const HeadCmp = component$(() => {
  useVisibleTask$(() => {
    console.warn('client effect');
  });
  return (
    <head>
      <title>hola</title>
      <Slot></Slot>
    </head>
  );
});

export const RenderSignals = component$(() => {
  const signal = useSignal('value');
  return (
    <>
      <head>
        <title>{signal.value}</title>
        <style>{signal.value}</style>
        <script>{signal.value}</script>
      </head>
    </>
  );
});

export const HtmlContext = component$(() => {
  const store = useStore({});
  useStylesQrl(inlinedQrl(`body {background: blue}`, 'styles_DelayResource'));
  useContextProvider(CTX_INTERNAL, store);

  return <Slot />;
});

async function testSSR(
  node: JSXOutput,
  expected: string | string[],
  opts?: Partial<RenderSSROptions>
) {
  let chunks: string[] = [];
  const stream: StreamWriter = {
    write(chunk) {
      chunks.push(chunk);
    },
  };
  await _renderSSR(node, {
    stream,
    containerTagName: 'html',
    containerAttributes: {},
    manifestHash: 'test',
    ...opts,
  });
  chunks = chunks.map((c) => c.replace(/ q:instance="[^"]+"/, ''));
  if (typeof expected === 'string') {
    const options = { parser: 'html', htmlWhitespaceSensitivity: 'ignore' } as const;
    expect(await format(chunks.join(''), options)).toBe(
      await format(expected.replace(/(\n|^)\s+/gm, ''), options)
    );
  } else {
    expect(chunks).toEqual(expected);
  }
}

export const DelayResource = component$((props: { text: string; delay: number }) => {
  useStylesQrl(inlinedQrl(`.cmp {background: blue}`, 'styles_DelayResource'));

  const resource = useResource$<string>(async ({ track }) => {
    track(() => props.text);
    await delay(props.delay);
    return props.text;
  });
  return (
    <div class="cmp">
      <Resource value={resource} onResolved={(value) => <span>{value}</span>} />
    </div>
  );
});

export const NullCmp = component$(() => {
  return null;
});

export const EffectTransparent = component$(() => {
  useVisibleTask$(() => {
    console.warn('log');
  });
  return <Slot />;
});

export const EffectTransparentRoot = component$(() => {
  useVisibleTask$(() => {
    console.warn('log');
  });
  return (
    <EffectTransparent>
      <section>Hello</section>
    </EffectTransparent>
  );
});

export const HideUntilVisible = component$(() => {
  const isNotVisible = useSignal(true);

  useVisibleTask$(() => {
    if (isNotVisible.value) {
      isNotVisible.value = false;
    }
  });

  // NOTE: if you comment the line below,
  // there will only be one "Content"
  if (isNotVisible.value) {
    return <div></div>;
  }

  return (
    <div>
      <p>Hide until visible</p>
      <Slot />
    </div>
  );
});

export const Issue4283 = component$(() => {
  return (
    <HideUntilVisible>
      <p>Content</p>
      <Slot />
    </HideUntilVisible>
  );
});

async function throws<T>(fn: () => T, expected?: string | RegExp): Promise<void> {
  try {
    await fn();
    expect.unreachable('Expression should throw');
  } catch (e) {
    if (expected) {
      expect(String(e)).toBe(expected);
    }
  }
}
