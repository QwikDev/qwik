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
      1507,
      3334,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"var e,t,o=document,r=window,n="w",s="d",i=new Set,a=new Set([o]),c=new Map,l=(e,t)=>Array.from(e.querySelectorAll(t)),q=e=>{const t=[];return a.forEach(o=>t.push(...l(o,e))),t},d=(e,t,o,r=!1)=>e.addEventListener(t,o,{capture:r,passive:!1}),b=e=>{_(e),l(e,"[q\\\\:shadowroot]").forEach(e=>{const t=e.shadowRoot;t&&b(t)})},f=e=>e&&"function"==typeof e.then,p=e=>{if(void 0===e._qwikjson_){let t=(e===o.documentElement?o.body:e).lastElementChild;for(;t;){if("SCRIPT"===t.tagName&&"qwik/json"===t.getAttribute("type")){e._qwikjson_=JSON.parse(t.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}t=t.previousElementSibling}}},u=(e,t)=>new CustomEvent(e,{detail:t}),h=(e,t)=>{o.dispatchEvent(u(e,t))},v=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),m=e=>e.replace(/-./g,e=>e[1].toUpperCase()),w=e=>({scope:e.charAt(0),eventName:m(e.slice(2))}),y=async(e,t,r,n)=>{n&&(e.hasAttribute("preventdefault:"+n)&&t.preventDefault(),e.hasAttribute("stoppropagation:"+n)&&t.stopPropagation());const s=e._qDispatch?.[r];if(s){if(s.length)for(const o of s){const r=o?.(t,e);f(r)&&await r}return}const i=e.getAttribute("q-"+r);if(i){const r=e.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),n=r.getAttribute("q:base"),s=new URL(n,o.baseURI);for(const a of i.split("|")){const i=performance.now(),[l,q,d]=a.split("#"),b={qBase:n,symbol:q,element:e,reqTime:i};let u,v,m;if(""===l)u=(o["qFuncs_"+r.getAttribute("q:instance")]||[])[Number.parseInt(q)],u||(v="sync",m=Error("sym:"+q));else{const e=\`\${q}|\${n}|\${l}\`;if(u=c.get(e),!u){const t=new URL(l,s).href;try{const o=import(t);p(r),u=(await o)[q],u?(c.set(e,u),h("qsymbol",b)):(v="no-symbol",m=Error(\`\${q} not in \${t}\`))}catch(e){v="async",m=e}}}if(u){if(e.isConnected)try{const o=u.call(d,t,e);f(o)&&await o}catch(e){h("qerror",{error:e,...b})}}else h("qerror",{importError:v,error:m,...b}),console.error(m)}}},E=async e=>{const t=v(e.type),o="e:"+t;let r=e.target;for(;r&&r.getAttribute;){const n=y(r,e,o,t),s=e.bubbles&&!e.cancelBubble;f(n)&&await n,r=s&&e.bubbles&&!e.cancelBubble?r.parentElement:null}},g=(e,t)=>{const o=v(t.type),r=e+":"+o;q("[q-"+e+"\\\\:"+o+"]").forEach(e=>y(e,t,r,o))},A=async e=>{g(s,e)},C=e=>{g(n,e)},k=()=>{const n=o.readyState;if("interactive"==n||"complete"==n){if(t=1,a.forEach(b),i.has("d:qinit")){i.delete("d:qinit");const e=u("qinit");q("[q-d\\\\:qinit]").forEach(t=>{y(t,e,"d:qinit"),t.removeAttribute("q-d:qinit")})}i.has("d:qidle")&&(i.delete("d:qidle"),(r.requestIdleCallback??r.setTimeout).bind(r)(()=>{const e=u("qidle");q("[q-d\\\\:qidle]").forEach(t=>{y(t,e,"d:qidle"),t.removeAttribute("q-d:qidle")})})),i.has("e:qvisible")&&(e||(e=new IntersectionObserver(t=>{for(const o of t)o.isIntersecting&&(e.unobserve(o.target),y(o.target,u("qvisible",o),"e:qvisible"))})),q("[q-e\\\\:qvisible]:not([q\\\\:observed])").forEach(t=>{e.observe(t),t.setAttribute("q:observed","true")}))}},_=(...e)=>{for(const o of e)if("string"==typeof o){if(!i.has(o)){i.add(o);const{scope:e,eventName:c}=w(o);e===n?d(r,c,C,!0):a.forEach(t=>d(t,c,e===s?A:E,!0)),1!==t||"e:qvisible"!==o&&"d:qinit"!==o&&"d:qidle"!==o||k()}}else a.has(o)||(i.forEach(e=>{const{scope:t,eventName:r}=w(e);t!==n&&d(o,r,t===s?A:E,!0)}),a.add(o))},S=r._qwikEv;S?.roots||(Array.isArray(S)?_(...S):_("e:click","e:input"),r._qwikEv={events:i,roots:a,push:_},d(o,"readystatechange",k),k());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
