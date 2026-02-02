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
      1470,
      3281,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const e=document,t=window,o="w",r="d",n=new Set,s=new Set([e]),i=new Map;let a,c;const l=(e,t)=>Array.from(e.querySelectorAll(t)),q=e=>{const t=[];return s.forEach(o=>t.push(...l(o,e))),t},d=(e,t,o,r=!1)=>e.addEventListener(t,o,{capture:r,passive:!1}),p=e=>{S(e),l(e,"[q\\\\:shadowroot]").forEach(e=>{const t=e.shadowRoot;t&&p(t)})},f=e=>e&&"function"==typeof e.then,b=t=>{if(void 0===t._qwikjson_){let o=(t===e.documentElement?e.body:t).lastElementChild;for(;o;){if("SCRIPT"===o.tagName&&"qwik/json"===o.getAttribute("type")){t._qwikjson_=JSON.parse(o.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}o=o.previousElementSibling}}},u=(e,t)=>new CustomEvent(e,{detail:t}),h=(t,o)=>{e.dispatchEvent(u(t,o))},v=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),m=e=>e.replace(/-./g,e=>e[1].toUpperCase()),y=e=>({scope:e.charAt(0),eventName:m(e.slice(2))}),w=async(t,o,r,n)=>{n&&(t.hasAttribute("preventdefault:"+n)&&o.preventDefault(),t.hasAttribute("stoppropagation:"+n)&&o.stopPropagation());const s=t.qDispatchEvent;if(s)return s(o,r);const a=t.getAttribute("q-"+r);if(a){const r=t.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),n=r.getAttribute("q:base"),s=new URL(n,e.baseURI);for(const c of a.split("|")){const a=performance.now(),[l,q,d]=c.split("#"),p={qBase:n,symbol:q,element:t,reqTime:a};let u,v,m;if(""===l){const t=r.getAttribute("q:instance");u=(e["qFuncs_"+t]||[])[Number.parseInt(q)],u||(v="sync",m=Error("sym:"+q))}else{const e=\`\${q}|\${n}|\${l}\`;if(u=i.get(e),!u){const t=new URL(l,s).href;try{const o=import(t);b(r),u=(await o)[q],u?(i.set(e,u),h("qsymbol",p)):(v="no-symbol",m=Error(\`\${q} not in \${t}\`))}catch(e){v="async",m=e}}}if(u){if(t.isConnected)try{const e=u.call(d,o,t);f(e)&&await e}catch(e){h("qerror",{error:e,...p})}}else h("qerror",{importError:v,error:m,...p}),console.error(m)}}},E=async e=>{const t=v(e.type),o="e:"+t;let r=e.target;for(;r&&r.getAttribute;){const n=w(r,e,o,t);f(n)&&await n,r=e.bubbles&&!e.cancelBubble?r.parentElement:null}},g=(e,t)=>{const o=v(t.type),r=e+":"+o;q("[qe\\\\:"+e+"\\\\:"+o+"]").forEach(e=>w(e,t,r,o))},A=async e=>{g(r,e)},C=e=>{g(o,e)},k=()=>{const o=e.readyState;if("interactive"==o||"complete"==o){if(c=1,s.forEach(p),n.has("d:qinit")){n.delete("d:qinit");const e=u("qinit");q("[qe\\\\:d\\\\:qinit]").forEach(t=>{w(t,e,"d:qinit"),t.removeAttribute("q-d:qinit")})}n.has("d:qidle")&&(n.delete("d:qidle"),(t.requestIdleCallback??t.setTimeout).bind(t)(()=>{const e=u("qidle");q("[qe\\\\:d\\\\:qidle]").forEach(t=>{w(t,e,"d:qidle"),t.removeAttribute("q-d:qidle")})})),n.has("e:qvisible")&&(a||(a=new IntersectionObserver(e=>{for(const t of e)t.isIntersecting&&(a.unobserve(t.target),w(t.target,u("qvisible",t),"e:qvisible"))})),q("[qe\\\\:e\\\\:qvisible]:not([q\\\\:observed])").forEach(e=>{a.observe(e),e.setAttribute("q:observed","true")}))}},S=(...e)=>{for(const i of e)if("string"==typeof i){if(!n.has(i)){n.add(i);const{scope:e,eventName:a}=y(i);e===o?d(t,a,C,!0):s.forEach(t=>d(t,a,e===r?A:E,!0)),1!==c||"e:qvisible"!==i&&"d:qinit"!==i&&"d:qidle"!==i||k()}}else s.has(i)||(n.forEach(e=>{const{scope:t,eventName:n}=y(e);t!==o&&d(i,n,t===r?A:E,!0)}),s.add(i))},_=t._qwikEv;_?.roots||(Array.isArray(_)?S(..._):S("e:click","e:input"),t._qwikEv={events:n,roots:s,push:S},d(e,"readystatechange",k),k());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
