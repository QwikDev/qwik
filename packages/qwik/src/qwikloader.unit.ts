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
      1542,
      3458,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const e=document,t=window,o="w",n="d",r=new Set,s=new Set([e]),i=new Map;let a,c;const l=(e,t)=>Array.from(e.querySelectorAll(t)),q=e=>{const t=[];return s.forEach(o=>t.push(...l(o,e))),t},d=(e,t,o,n=!1)=>e.addEventListener(t,o,{capture:n,passive:!1}),b=e=>{_(e),l(e,"[q\\\\:shadowroot]").forEach(e=>{const t=e.shadowRoot;t&&b(t)})},f=e=>e&&"function"==typeof e.then,p=t=>{if(void 0===t._qwikjson_){let o=(t===e.documentElement?e.body:t).lastElementChild;for(;o;){if("SCRIPT"===o.tagName&&"qwik/json"===o.getAttribute("type")){t._qwikjson_=JSON.parse(o.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}o=o.previousElementSibling}}},u=(e,t)=>new CustomEvent(e,{detail:t}),h=(t,o)=>{e.dispatchEvent(u(t,o))},m=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),v=e=>e.replace(/-./g,e=>e[1].toUpperCase()),w=e=>({scope:e.charAt(0),eventName:v(e.slice(2))}),y=async(t,o,n,r)=>{r&&(t.hasAttribute("preventdefault:"+r)&&o.preventDefault(),t.hasAttribute("stoppropagation:"+r)&&o.stopPropagation());const s=t._qDispatch?.[n];if(s){if("function"==typeof s){const e=s(o,t);f(e)&&await e}else if(s.length)for(let e=0;e<s.length;e++){const n=s[e],r=n?.(o,t);f(r)&&await r}return}const a=t.getAttribute("q-"+n);if(a){const n=t.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),r=n.getAttribute("q:base"),s=new URL(r,e.baseURI);for(const c of a.split("|")){const a=performance.now(),[l,q,d]=c.split("#"),b={qBase:r,symbol:q,element:t,reqTime:a};let u,m,v;if(""===l){const t=n.getAttribute("q:instance");u=(e["qFuncs_"+t]||[])[Number.parseInt(q)],u||(m="sync",v=Error("sym:"+q))}else{const e=\`\${q}|\${r}|\${l}\`;if(u=i.get(e),!u){const t=new URL(l,s).href;try{const o=import(t);p(n),u=(await o)[q],u?(i.set(e,u),h("qsymbol",b)):(m="no-symbol",v=Error(\`\${q} not in \${t}\`))}catch(e){m="async",v=e}}}if(u){if(t.isConnected)try{const e=u.call(d,o,t);f(e)&&await e}catch(e){h("qerror",{error:e,...b})}}else h("qerror",{importError:m,error:v,...b}),console.error(v)}}},g=async e=>{const t=m(e.type),o="e:"+t;let n=e.target;for(;n&&n.getAttribute;){const r=y(n,e,o,t),s=e.bubbles&&!e.cancelBubble;f(r)&&await r,n=s&&e.bubbles&&!e.cancelBubble?n.parentElement:null}},E=(e,t)=>{const o=m(t.type),n=e+":"+o;q("[q-"+e+"\\\\:"+o+"]").forEach(e=>y(e,t,n,o))},A=async e=>{E(n,e)},C=e=>{E(o,e)},k=()=>{const o=e.readyState;if("interactive"==o||"complete"==o){if(c=1,s.forEach(b),r.has("d:qinit")){r.delete("d:qinit");const e=u("qinit");q("[q-d\\\\:qinit]").forEach(t=>{y(t,e,"d:qinit"),t.removeAttribute("q-d:qinit")})}r.has("d:qidle")&&(r.delete("d:qidle"),(t.requestIdleCallback??t.setTimeout).bind(t)(()=>{const e=u("qidle");q("[q-d\\\\:qidle]").forEach(t=>{y(t,e,"d:qidle"),t.removeAttribute("q-d:qidle")})})),r.has("e:qvisible")&&(a||(a=new IntersectionObserver(e=>{for(const t of e)t.isIntersecting&&(a.unobserve(t.target),y(t.target,u("qvisible",t),"e:qvisible"))})),q("[q-e\\\\:qvisible]:not([q\\\\:observed])").forEach(e=>{a.observe(e),e.setAttribute("q:observed","true")}))}},_=(...e)=>{for(let i=0;i<e.length;i++){const a=e[i];if("string"==typeof a){if(!r.has(a)){r.add(a);const{scope:e,eventName:i}=w(a);e===o?d(t,i,C,!0):s.forEach(t=>d(t,i,e===n?A:g,!0)),1!==c||"e:qvisible"!==a&&"d:qinit"!==a&&"d:qidle"!==a||k()}}else s.has(a)||(r.forEach(e=>{const{scope:t,eventName:r}=w(e);t!==o&&d(a,r,t===n?A:g,!0)}),s.add(a))}},S=t._qwikEv;S?.roots||(Array.isArray(S)?_(...S):_("e:click","e:input"),t._qwikEv={events:r,roots:s,push:_},d(e,"readystatechange",k),k());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
