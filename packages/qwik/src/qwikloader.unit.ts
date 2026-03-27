import { readFileSync } from 'fs';
import { expect, test } from 'vitest';
import compress from 'brotli/compress.js';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { createDocument } from './testing/document';

const __dirname = dirname(fileURLToPath(import.meta.url));
let loaderImportNonce = 0;

// Run `pnpm build --qwik --dev` to update
test('qwikloader script', () => {
  let qwikLoader: string = '';
  try {
    qwikLoader = readFileSync(resolve(__dirname, '../dist/qwikloader.js'), 'utf-8');
  } catch {
    // ignore, we didn't build yet
  }
  // This is to ensure we are deliberate about changes to qwikloader.
  expect(qwikLoader.length).toBeGreaterThan(0);
  /**
   * Note that the source length can be shorter by using strings in variables and using those to
   * dereference objects etc, but that actually results in worse compression
   */
  const compressed = compress(Buffer.from(qwikLoader), { mode: 1, quality: 11 });
  expect([compressed.length, qwikLoader.length]).toMatchInlineSnapshot(`
    [
      2043,
      4903,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const e=document,t=window,n="w",s="d",r="preventdefault:",o="capture:",a="passive:",i="false",c=0,l=1,d=2,p=new Set,u=new Set([e]),f=new Map,h=new WeakMap,q=new Map;let b,v;const g=(e,t)=>Array.from(e.querySelectorAll(t)),w=e=>{const t=[];return u.forEach(n=>t.push(...g(n,e))),t},m=(e,t,n,s=!1,r=!1)=>e.addEventListener(t,n,{capture:s,passive:r}),E=(e,t,n,s=!1)=>e.removeEventListener(t,n,{capture:s}),y=e=>{Z(e),g(e,"[q\\\\:shadowroot]").forEach(e=>{const t=e.shadowRoot;t&&y(t)})},A=e=>e&&"function"==typeof e.then,k=t=>{if(void 0===t._qwikjson_){let n=(t===e.documentElement?e.body:t).lastElementChild;for(;n;){if("SCRIPT"===n.tagName&&"qwik/json"===n.getAttribute("type")){t._qwikjson_=JSON.parse(n.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}n=n.previousElementSibling}}},C=(e,t)=>new CustomEvent(e,{detail:t}),S=(t,n)=>{e.dispatchEvent(C(t,n))},_=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),I=e=>e.replace(/-./g,e=>e[1].toUpperCase()),N=e=>({scope:e.charAt(0),eventName:I(e.slice(2))}),$=e=>null!==e&&e!==i,L=(e,t)=>{const n=[],s=[],i=[];let c=e;const l=o+t,d=a+t,p=r+t;for(;c&&c.getAttribute;)n.push(c),s.push($(c.getAttribute(l))),i.push($(c.getAttribute(d))&&!c.hasAttribute(p)),c=c.parentElement;return{elements:n,captures:s,passives:i}},R=(e,t)=>{let n=!1,s=!1;const o=new Set;return g(e,"[q-e\\\\:"+t+"]").forEach(e=>o.add(e)),g(e,"[preventdefault\\\\:"+t+"]").forEach(e=>o.add(e)),g(e,"[passive\\\\:"+t+"]").forEach(e=>o.add(e)),o.forEach(e=>{$(e.getAttribute(a+t))&&!e.hasAttribute(r+t)?s=!0:n=!0}),n||s||(n=!0),{active:n,passive:s}},M=(e,t)=>h.get(e)?.has(t),U=(e,t)=>{let n=h.get(e);n||(n=new Set,h.set(e,n)),n.add(t)},j=(e,t,n,s,r=!1)=>{let o=f.get(e);o||(o=new Map,f.set(e,o));const a=o.get(t);a&&E(e,n,a.handler,!0),m(e,n,s,!0,r),o.set(t,{handler:s})},x=(e,t,n)=>{const s=f.get(e),r=s?.get(t);r&&(E(e,n,r.handler,!0),s.delete(t),0===s.size&&f.delete(e))},B=async(t,n,s,r)=>{r&&(t.hasAttribute("preventdefault:"+r)&&n.preventDefault(),t.hasAttribute("stoppropagation:"+r)&&n.stopPropagation());const o=t._qDispatch?.[s];if(o){if("function"==typeof o){const e=o(n,t);A(e)&&await e}else if(o.length)for(let e=0;e<o.length;e++){const s=o[e],r=s?.(n,t);A(r)&&await r}return}const a=t.getAttribute("q-"+s);if(a){const s=t.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),r=s.getAttribute("q:base"),o=new URL(r,e.baseURI);for(const i of a.split("|")){const a=performance.now(),[c,l,d]=i.split("#"),p={qBase:r,symbol:l,element:t,reqTime:a};let u,f,h;if(""===c){const t=s.getAttribute("q:instance");u=(e["qFuncs_"+t]||[])[Number.parseInt(l)],u||(f="sync",h=Error("sym:"+l))}else{const e=\`\${l}|\${r}|\${c}\`;if(u=q.get(e),!u){const t=new URL(c,o).href;try{const n=import(t);k(s),u=(await n)[l],u?(q.set(e,u),S("qsymbol",p)):(f="no-symbol",h=Error(\`\${l} not in \${t}\`))}catch(e){f="async",h=e}}}if(u){if(t.isConnected)try{const e=u.call(d,n,t);A(e)&&await e}catch(e){S("qerror",{error:e,...p})}}else S("qerror",{importError:f,error:h,...p}),console.error(h)}}},T=async(e,t=2)=>{const n=_(e.type),s="e:"+n,{elements:r,captures:o,passives:a}=L(e.target,n);for(let i=r.length-1;i>=0;i--){if(!o[i]||2!==t&&a[i]!==(1===t))continue;const c=B(r[i],e,s,n);if(A(c)&&await c,e.cancelBubble)return}for(let i=0;i<r.length;i++){if(o[i]||2!==t&&a[i]!==(1===t))continue;const c=B(r[i],e,s,n);if(A(c)&&await c,!e.bubbles||e.cancelBubble)return}},D=(e,t)=>async n=>{M(n,e)||(U(n,e),await T(n,t))},O=(e,t)=>{const n=_(t.type),s=e+":"+n;w("[q-"+e+"\\\\:"+n+"]").forEach(e=>B(e,t,s,n))},P=async e=>{O(s,e)},z=e=>{O(n,e)},F=()=>{const n=e.readyState;if("interactive"==n||"complete"==n){if(v=1,u.forEach(y),p.has("d:qinit")){p.delete("d:qinit");const e=C("qinit");w("[q-d\\\\:qinit]").forEach(t=>{B(t,e,"d:qinit"),t.removeAttribute("q-d:qinit")})}p.has("d:qidle")&&(p.delete("d:qidle"),(t.requestIdleCallback??t.setTimeout).bind(t)(()=>{const e=C("qidle");w("[q-d\\\\:qidle]").forEach(t=>{B(t,e,"d:qidle"),t.removeAttribute("q-d:qidle")})})),p.has("e:qvisible")&&(b||(b=new IntersectionObserver(e=>{for(const t of e)t.isIntersecting&&(b.unobserve(t.target),B(t.target,C("qvisible",t),"e:qvisible"))})),w("[q-e\\\\:qvisible]:not([q\\\\:observed])").forEach(e=>{b.observe(e),e.setAttribute("q:observed","true")}))}},J=(e,t,n)=>{const s=t+"|active",r=t+"|passive",{active:o,passive:a}=R(e,t.slice(2));o?j(e,s,n,D(e,a?2:0)):x(e,s,n),a?j(e,r,n,D(e,1),!0):x(e,r,n)},W=e=>{const{scope:r,eventName:o}=N(e);r!==n?r!==s?u.forEach(t=>J(t,e,o)):u.forEach(t=>j(t,e,o,P)):j(t,e,o,z)},Z=(...e)=>{for(let t=0;t<e.length;t++){const r=e[t];if("string"==typeof r){const e=!p.has(r);e&&p.add(r),W(r),!e||1!==v||"e:qvisible"!==r&&"d:qinit"!==r&&"d:qidle"!==r||F()}else u.has(r)||(u.add(r),p.forEach(e=>{const{scope:t,eventName:o}=N(e);t!==n&&(t===s?j(r,e,o,P):J(r,e,o))}))}},G=t._qwikEv;G?.roots||(Array.isArray(G)?Z(...G):Z("e:click","e:input"),t._qwikEv={events:p,roots:u,push:Z},m(e,"readystatechange",F),F());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});

type ListenerRecord = {
  handler: (ev: Event) => void | Promise<void>;
  options: AddEventListenerOptions | boolean | undefined;
};

type ListenerRegistry = Map<string, ListenerRecord[]>;

const addListenerRecord = (
  registry: ListenerRegistry,
  name: string,
  handler: ListenerRecord['handler'],
  options: ListenerRecord['options']
) => {
  const listeners = registry.get(name);
  if (listeners) {
    listeners.push({ handler, options });
  } else {
    registry.set(name, [{ handler, options }]);
  }
};

const removeListenerRecord = (
  registry: ListenerRegistry,
  name: string,
  handler: ListenerRecord['handler']
) => {
  const listeners = registry.get(name);
  if (!listeners) {
    return;
  }
  const nextListeners = listeners.filter((listener) => listener.handler !== handler);
  if (nextListeners.length) {
    registry.set(name, nextListeners);
  } else {
    registry.delete(name);
  }
};

const loadQwikLoader = async (html: string, events: string[]) => {
  const document = createDocument({ html }) as Document & {
    readyState: string;
    defaultView: Window & {
      _qwikEv: string[];
      requestIdleCallback?: Window['requestIdleCallback'];
    };
  };
  document.readyState = 'loading';
  const window = document.defaultView;
  window._qwikEv = [...events];
  window.requestIdleCallback = ((cb: IdleRequestCallback) => setTimeout(cb, 0)) as any;

  const docListeners = new Map<string, ListenerRecord[]>();
  const winListeners = new Map<string, ListenerRecord[]>();

  document.addEventListener = ((name: string, handler: any, options?: any) => {
    addListenerRecord(docListeners, name, handler, options);
  }) as any;
  document.removeEventListener = ((name: string, handler: any) => {
    removeListenerRecord(docListeners, name, handler);
  }) as any;
  window.addEventListener = ((name: string, handler: any, options?: any) => {
    addListenerRecord(winListeners, name, handler, options);
  }) as any;
  window.removeEventListener = ((name: string, handler: any) => {
    removeListenerRecord(winListeners, name, handler);
  }) as any;

  const previousDocument = (globalThis as any).document;
  const previousWindow = (globalThis as any).window;
  const previousCustomEvent = (globalThis as any).CustomEvent;

  (globalThis as any).document = document;
  (globalThis as any).window = window;
  (globalThis as any).CustomEvent = window.CustomEvent;

  try {
    loaderImportNonce++;
    await import(
      pathToFileURL(resolve(__dirname, '../dist/qwikloader.js')).href + `?t=${loaderImportNonce}`
    );
  } finally {
    (globalThis as any).document = previousDocument;
    (globalThis as any).window = previousWindow;
    (globalThis as any).CustomEvent = previousCustomEvent;
  }

  return {
    document,
    window,
    docListeners,
    winListeners,
  };
};

test('qwikloader dispatches capture handlers before bubble handlers', async () => {
  const { document, docListeners } = await loadQwikLoader(
    `
      <div id="parent" q:container="paused">
        <section id="section" capture:click>
          <button id="button"></button>
        </section>
      </div>
    `,
    ['e:click']
  );
  const order: string[] = [];
  const parent = document.querySelector('#parent') as any;
  const section = document.querySelector('#section') as any;
  const button = document.querySelector('#button') as any;

  parent._qDispatch = {
    'e:click': () => {
      order.push('parent-bubble');
    },
  };
  section._qDispatch = {
    'e:click': () => {
      order.push('section-capture');
    },
  };
  button._qDispatch = {
    'e:click': () => {
      order.push('button-bubble');
    },
  };

  const clickListener = docListeners.get('click');
  expect(clickListener).toHaveLength(1);

  await clickListener![0].handler({
    type: 'click',
    target: button,
    bubbles: true,
    cancelBubble: false,
    preventDefault() {},
    stopPropagation() {
      this.cancelBubble = true;
    },
  } as any);

  expect(order).toEqual(['section-capture', 'button-bubble', 'parent-bubble']);
});

test('qwikloader registers passive listeners from passive attributes', async () => {
  const passive = await loadQwikLoader(
    `
      <div q:container="paused">
        <div q-e:wheel="" passive:wheel></div>
      </div>
    `,
    ['e:wheel']
  );
  expect(passive.docListeners.get('wheel')?.map((listener) => listener.options)).toEqual([
    { capture: true, passive: true },
  ]);

  const active = await loadQwikLoader(
    `
      <div q:container="paused">
        <div q-e:wheel="" passive:wheel="false"></div>
      </div>
    `,
    ['e:wheel']
  );
  expect(active.docListeners.get('wheel')?.map((listener) => listener.options)).toEqual([
    { capture: true, passive: false },
  ]);

  const mixed = await loadQwikLoader(
    `
      <div q:container="paused">
        <div q-e:wheel="" passive:wheel></div>
        <div q-e:wheel=""></div>
      </div>
    `,
    ['e:wheel']
  );
  expect(mixed.docListeners.get('wheel')?.map((listener) => listener.options)).toEqual([
    { capture: true, passive: false },
    { capture: true, passive: true },
  ]);
});

test('qwikloader only dispatches mixed passive events once', async () => {
  const { document, docListeners } = await loadQwikLoader(
    `
      <div id="parent" q:container="paused" q-e:wheel="" passive:wheel>
        <button id="button" q-e:wheel=""></button>
      </div>
    `,
    ['e:wheel']
  );
  const order: string[] = [];
  const parent = document.querySelector('#parent') as any;
  const button = document.querySelector('#button') as any;

  parent._qDispatch = {
    'e:wheel': () => {
      order.push('parent-passive');
    },
  };
  button._qDispatch = {
    'e:wheel': () => {
      order.push('button-active');
    },
  };

  const wheelListeners = docListeners.get('wheel');
  expect(wheelListeners).toHaveLength(2);

  const event = {
    type: 'wheel',
    target: button,
    bubbles: true,
    cancelBubble: false,
    preventDefault() {},
    stopPropagation() {
      this.cancelBubble = true;
    },
  } as any;

  for (const listener of wheelListeners!) {
    await listener.handler(event);
  }

  expect(order).toEqual(['button-active', 'parent-passive']);
});
