import { readFileSync } from 'fs';
import { expect, test } from 'vitest';
import compress from 'brotli/compress.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
      1563,
      3637,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"var e,t,n=document,o=window,r="w",s="d",i=new Set,a=new Set([n]),l=new Map,c=(e,t)=>Array.from(e.querySelectorAll(t)),q=e=>{const t=[];return a.forEach(n=>t.push(...c(n,e))),t},d=(e,t,n,o=!1)=>e.addEventListener(t,n,{capture:o,passive:!1}),b=e=>{_(e);const t=c(e,"[q\\\\:shadowroot]");for(let e=0;e<t.length;e++){const n=t[e].shadowRoot;n&&b(n)}},f=e=>e&&"function"==typeof e.then,p=e=>{if(void 0===e._qwikjson_){let t=(e===n.documentElement?n.body:e).lastElementChild;for(;t;){if("SCRIPT"===t.tagName&&"qwik/json"===t.getAttribute("type")){e._qwikjson_=JSON.parse(t.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}t=t.previousElementSibling}}},u=(e,t)=>new CustomEvent(e,{detail:t}),h=(e,t)=>{n.dispatchEvent(u(e,t))},g=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),v=e=>e.replace(/-./g,e=>e[1].toUpperCase()),m=e=>({scope:e.charAt(0),eventName:v(e.slice(2))}),w=async(e,t,o,r)=>{r&&(e.hasAttribute("preventdefault:"+r)&&t.preventDefault(),e.hasAttribute("stoppropagation:"+r)&&t.stopPropagation());const s=e._qDispatch?.[o];if(s){if("function"==typeof s){const n=s(t,e);f(n)&&await n}else if(s.length)for(let n=0;n<s.length;n++){const o=s[n],r=o?.(t,e);f(r)&&await r}return}const i=e.getAttribute("q-"+o);if(i){const o=e.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),r=o.getAttribute("q:base"),s=new URL(r,n.baseURI),a=i.split("|");for(let i=0;i<a.length;i++){const c=a[i],q=performance.now(),[d,b,u]=c.split("#"),g={qBase:r,symbol:b,element:e,reqTime:q};let v,m,w;if(""===d)v=(n["qFuncs_"+o.getAttribute("q:instance")]||[])[Number.parseInt(b)],v||(m="sync",w=Error("sym:"+b));else{const e=\`\${b}|\${r}|\${d}\`;if(v=l.get(e),!v){const t=new URL(d,s).href;try{const n=import(t);p(o),v=(await n)[b],v?(l.set(e,v),h("qsymbol",g)):(m="no-symbol",w=Error(\`\${b} not in \${t}\`))}catch(e){m="async",w=e}}}if(v){if(e.isConnected)try{const n=v.call(u,t,e);f(n)&&await n}catch(e){h("qerror",{error:e,...g})}}else h("qerror",{importError:m,error:w,...g}),console.error(w)}}},y=async e=>{const t=g(e.type),n="e:"+t;let o=e.target;for(;o&&o.getAttribute;){const r=w(o,e,n,t),s=e.bubbles&&!e.cancelBubble;f(r)&&await r,o=s&&e.bubbles&&!e.cancelBubble?o.parentElement:null}},A=(e,t)=>{const n=g(t.type),o=e+":"+n,r=q("[q-"+e+"\\\\:"+n+"]");for(let e=0;e<r.length;e++){const s=r[e];w(s,t,o,n)}},E=async e=>{A(s,e)},C=e=>{A(r,e)},k=()=>{const r=n.readyState;if("interactive"==r||"complete"==r){if(t=1,a.forEach(b),i.has("d:qinit")){i.delete("d:qinit");const e=u("qinit"),t=q("[q-d\\\\:qinit]");for(let n=0;n<t.length;n++){const o=t[n];w(o,e,"d:qinit"),o.removeAttribute("q-d:qinit")}}if(i.has("d:qidle")&&(i.delete("d:qidle"),(o.requestIdleCallback??o.setTimeout).bind(o)(()=>{const e=u("qidle"),t=q("[q-d\\\\:qidle]");for(let n=0;n<t.length;n++){const o=t[n];w(o,e,"d:qidle"),o.removeAttribute("q-d:qidle")}})),i.has("e:qvisible")){e||(e=new IntersectionObserver(t=>{for(let n=0;n<t.length;n++){const o=t[n];o.isIntersecting&&(e.unobserve(o.target),w(o.target,u("qvisible",o),"e:qvisible"))}}));const t=q("[q-e\\\\:qvisible]:not([q\\\\:observed])");for(let n=0;n<t.length;n++){const o=t[n];e.observe(o),o.setAttribute("q:observed","true")}}}},_=(...e)=>{for(let n=0;n<e.length;n++){const l=e[n];if("string"==typeof l){if(!i.has(l)){i.add(l);const{scope:e,eventName:n}=m(l);e===r?d(o,n,C,!0):a.forEach(t=>d(t,n,e===s?E:y,!0)),1!==t||"e:qvisible"!==l&&"d:qinit"!==l&&"d:qidle"!==l||k()}}else a.has(l)||(i.forEach(e=>{const{scope:t,eventName:n}=m(e);t!==r&&d(l,n,t===s?E:y,!0)}),a.add(l))}},S=o._qwikEv;S?.roots||(Array.isArray(S)?_(...S):_("e:click","e:input"),o._qwikEv={events:i,roots:a,push:_},d(n,"readystatechange",k),k());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
