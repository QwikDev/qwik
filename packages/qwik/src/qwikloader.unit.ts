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
      1583,
      3660,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const e=document,t=window,n="w",o="d",r=new Set,s=new Set([e]),i=new Map;let a,c;const l=(e,t)=>Array.from(e.querySelectorAll(t)),q=e=>{const t=[];return s.forEach(n=>t.push(...l(n,e))),t},d=(e,t,n,o=!1)=>e.addEventListener(t,n,{capture:o,passive:!1}),b=e=>{_(e);const t=l(e,"[q\\\\:shadowroot]");for(let e=0;e<t.length;e++){const n=t[e].shadowRoot;n&&b(n)}},f=e=>e&&"function"==typeof e.then,p=t=>{if(void 0===t._qwikjson_){let n=(t===e.documentElement?e.body:t).lastElementChild;for(;n;){if("SCRIPT"===n.tagName&&"qwik/json"===n.getAttribute("type")){t._qwikjson_=JSON.parse(n.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}n=n.previousElementSibling}}},u=(e,t)=>new CustomEvent(e,{detail:t}),h=(t,n)=>{e.dispatchEvent(u(t,n))},g=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),m=e=>e.replace(/-./g,e=>e[1].toUpperCase()),v=e=>({scope:e.charAt(0),eventName:m(e.slice(2))}),w=async(t,n,o,r)=>{r&&(t.hasAttribute("preventdefault:"+r)&&n.preventDefault(),t.hasAttribute("stoppropagation:"+r)&&n.stopPropagation());const s=t._qDispatch?.[o];if(s){if("function"==typeof s){const e=s(n,t);f(e)&&await e}else if(s.length)for(let e=0;e<s.length;e++){const o=s[e],r=o?.(n,t);f(r)&&await r}return}const a=t.getAttribute("q-"+o);if(a){const o=t.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),r=o.getAttribute("q:base"),s=new URL(r,e.baseURI),c=a.split("|");for(let a=0;a<c.length;a++){const l=c[a],q=performance.now(),[d,b,u]=l.split("#"),g={qBase:r,symbol:b,element:t,reqTime:q};let m,v,w;if(""===d){const t=o.getAttribute("q:instance");m=(e["qFuncs_"+t]||[])[Number.parseInt(b)],m||(v="sync",w=Error("sym:"+b))}else{const e=\`\${b}|\${r}|\${d}\`;if(m=i.get(e),!m){const t=new URL(d,s).href;try{const n=import(t);p(o),m=(await n)[b],m?(i.set(e,m),h("qsymbol",g)):(v="no-symbol",w=Error(\`\${b} not in \${t}\`))}catch(e){v="async",w=e}}}if(m){if(t.isConnected)try{const e=m.call(u,n,t);f(e)&&await e}catch(e){h("qerror",{error:e,...g})}}else h("qerror",{importError:v,error:w,...g}),console.error(w)}}},y=async e=>{const t=g(e.type),n="e:"+t;let o=e.target;for(;o&&o.getAttribute;){const r=w(o,e,n,t),s=e.bubbles&&!e.cancelBubble;f(r)&&await r,o=s&&e.bubbles&&!e.cancelBubble?o.parentElement:null}},A=(e,t)=>{const n=g(t.type),o=e+":"+n,r=q("[q-"+e+"\\\\:"+n+"]");for(let e=0;e<r.length;e++){const s=r[e];w(s,t,o,n)}},E=async e=>{A(o,e)},C=e=>{A(n,e)},k=()=>{const n=e.readyState;if("interactive"==n||"complete"==n){if(c=1,s.forEach(b),r.has("d:qinit")){r.delete("d:qinit");const e=u("qinit"),t=q("[q-d\\\\:qinit]");for(let n=0;n<t.length;n++){const o=t[n];w(o,e,"d:qinit"),o.removeAttribute("q-d:qinit")}}if(r.has("d:qidle")&&(r.delete("d:qidle"),(t.requestIdleCallback??t.setTimeout).bind(t)(()=>{const e=u("qidle"),t=q("[q-d\\\\:qidle]");for(let n=0;n<t.length;n++){const o=t[n];w(o,e,"d:qidle"),o.removeAttribute("q-d:qidle")}})),r.has("e:qvisible")){a||(a=new IntersectionObserver(e=>{for(let t=0;t<e.length;t++){const n=e[t];n.isIntersecting&&(a.unobserve(n.target),w(n.target,u("qvisible",n),"e:qvisible"))}}));const e=q("[q-e\\\\:qvisible]:not([q\\\\:observed])");for(let t=0;t<e.length;t++){const n=e[t];a.observe(n),n.setAttribute("q:observed","true")}}}},_=(...e)=>{for(let i=0;i<e.length;i++){const a=e[i];if("string"==typeof a){if(!r.has(a)){r.add(a);const{scope:e,eventName:i}=v(a);e===n?d(t,i,C,!0):s.forEach(t=>d(t,i,e===o?E:y,!0)),1!==c||"e:qvisible"!==a&&"d:qinit"!==a&&"d:qidle"!==a||k()}}else s.has(a)||(r.forEach(e=>{const{scope:t,eventName:r}=v(e);t!==n&&d(a,r,t===o?E:y,!0)}),s.add(a))}},S=t._qwikEv;S?.roots||(Array.isArray(S)?_(...S):_("e:click","e:input"),t._qwikEv={events:r,roots:s,push:_},d(e,"readystatechange",k),k());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
