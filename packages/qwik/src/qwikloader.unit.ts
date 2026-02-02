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
      1453,
      3105,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const e=document,t=window,o=new Set,n=new Set([e]),r={},s="-window",a="-document";let i;const c=(e,t)=>Array.from(e.querySelectorAll(t)),l=e=>{const t=[];return n.forEach(o=>t.push(...c(o,e))),t},p=e=>{k(e),c(e,"[q\\\\:shadowroot]").forEach(e=>{const t=e.shadowRoot;t&&p(t)})},f=e=>e&&"function"==typeof e.then,b=(e,t,o=t.type)=>{l("[on"+e+"\\\\:"+o+"]").forEach(n=>{d(n,e,t,o)})},u=t=>{if(void 0===t._qwikjson_){let o=(t===e.documentElement?e.body:t).lastElementChild;for(;o;){if("SCRIPT"===o.tagName&&"qwik/json"===o.getAttribute("type")){t._qwikjson_=JSON.parse(o.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}o=o.previousElementSibling}}},h=(e,t)=>new CustomEvent(e,{detail:t}),d=async(t,o,n,s=n.type)=>{const a="on"+o+":"+s;t.hasAttribute("preventdefault:"+s)&&n.preventDefault(),t.hasAttribute("stoppropagation:"+s)&&n.stopPropagation();const i=t.qDispatchEvent;if(i)return i(n,o);const c=t.getAttribute(a);if(c){const o=t.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),s=o.getAttribute("q:base"),a=new URL(s,e.baseURI);for(const i of c.split("\\n")){const[c,l,p]=i.split("#"),b=new URL(c,a).href,h=performance.now();let d,q,y;const v=i.startsWith("#"),w={qBase:s,href:b,symbol:l,element:t,reqTime:h};if(v){const t=o.getAttribute("q:instance");d=(e["qFuncs_"+t]||[])[Number.parseInt(l)],d||(q="sync",y=Error("sym:"+l))}else if(d=r[b]?.[l]);else try{const e=import(b);u(o),d=(await e)[l],d?(r[b]||(r[b]={}))[l]=d:(q="no-symbol",y=Error(\`\${l} not in \${b}\`))}catch(e){q||(q="async"),y=e}if(!d){m("qerror",{importError:q,error:y,...w}),console.error(y);break}if(t.isConnected)try{v||m("qsymbol",w);const e=d.call(p,n,t);f(e)&&await e}catch(e){m("qerror",{error:e,...w})}}}},m=(t,o)=>{e.dispatchEvent(h(t,o))},q=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),y=async(e,t)=>{let o=q(e.type),n=e.target;if(t!==a)for(;n&&n.getAttribute;){const t=d(n,"",e,o);let r=e.cancelBubble;f(t)&&await t,r||(r=r||e.cancelBubble||n.hasAttribute("stoppropagation:"+e.type)),n=e.bubbles&&!0!==r?n.parentElement:null}else b(a,e,o)},v=e=>{b(s,e,q(e.type))},w=()=>{const r=e.readyState;if(!i&&("interactive"==r||"complete"==r)&&(n.forEach(p),i=1,m("qinit"),(t.requestIdleCallback??t.setTimeout).bind(t)(()=>m("qidle")),o.has(":qvisible"))){const e=l("[on\\\\:qvisible]"),t=new IntersectionObserver(e=>{for(const o of e)o.isIntersecting&&(t.unobserve(o.target),d(o.target,"",h("qvisible",o)))});e.forEach(e=>t.observe(e))}},g=(e,t,o,n=!1)=>{e.addEventListener(t,o,{capture:n,passive:!1})},E=e=>e.replace(/-./g,e=>e[1].toUpperCase()),A=e=>{const t=e.indexOf(":");let o="",n=e;if(t>=0){const r=e.substring(0,t);""!==r&&r!==s&&r!==a||(o=r,n=e.substring(t+1))}return{scope:o,eventName:E(n)}},k=(...e)=>{for(const r of e)if("string"==typeof r){if(!o.has(r)){o.add(r);const{scope:e,eventName:a}=A(r);e===s?g(t,a,v,!0):n.forEach(t=>g(t,a,t=>y(t,e),!0))}}else n.has(r)||(o.forEach(e=>{const{scope:t,eventName:o}=A(e);g(r,o,e=>y(e,t),!0)}),n.add(r))},C=t.qwikevents;C?.roots||(C&&(Array.isArray(C)?k(...C):k(":click",":input")),t.qwikevents={events:o,roots:n,push:k},g(e,"readystatechange",w),w());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
