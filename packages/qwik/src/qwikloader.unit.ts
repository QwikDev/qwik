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
      1615,
      3555,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const t=document,e=window,n=new Set,o=new Set([t]),r={},s="-window",i="-document";let a;const c=(t,e)=>Array.from(t.querySelectorAll(e)),l=t=>{const e=[];return o.forEach(n=>e.push(...c(n,t))),e},f=t=>{A(t),c(t,"[q\\\\:shadowroot]").forEach(t=>{const e=t.shadowRoot;e&&f(e)})},p=t=>t&&"function"==typeof t.then,u=(t,e,n=e.type)=>{l("[on"+t+"\\\\:"+n+"]").forEach(o=>{h(o,t,e,n)})},b=e=>{if(void 0===e._qwikjson_){let n=(e===t.documentElement?t.body:e).lastElementChild;for(;n;){if("SCRIPT"===n.tagName&&"qwik/json"===n.getAttribute("type")){e._qwikjson_=JSON.parse(n.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}n=n.previousElementSibling}}},q=(t,e)=>new CustomEvent(t,{detail:e}),h=async(e,n,o,s=o.type)=>{const i="on"+n+":"+s;e.hasAttribute("preventdefault:"+s)&&o.preventDefault(),e.hasAttribute("stoppropagation:"+s)&&o.stopPropagation();const a=e._qc_,c=a&&a.li.filter(t=>t[0]===i);if(c&&c.length>0){for(const t of c){const n=t[1].getFn([e,o],()=>e.isConnected)(o,e),r=o.cancelBubble;p(n)&&await n,r&&o.stopPropagation()}return}const l=e.qDispatchEvent;if(l)return l(o,n);const f=e.getAttribute(i);if(f){const n=e.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),s=n.getAttribute("q:base"),i=n.getAttribute("q:version")||"unknown",a=n.getAttribute("q:manifest-hash")||"dev",c=new URL(s,t.baseURI);for(const l of f.split("\\n")){const f=new URL(l,c),u=f.href,q=f.hash.replace(/^#?([^?[|]*).*$/,"$1")||"default",h=performance.now();let d,m,g;const y=l.startsWith("#"),v={qBase:s,qManifest:a,qVersion:i,href:u,symbol:q,element:e,reqTime:h};if(y){const e=n.getAttribute("q:instance");d=(t["qFuncs_"+e]||[])[Number.parseInt(q)],d||(m="sync",g=Error("sym:"+q))}else if(q in r)d=r[q];else{_("qsymbol",v);const t=f.href.split("#")[0];try{const e=import(t);b(n),d=(await e)[q],d?r[q]=d:(m="no-symbol",g=Error(\`\${q} not in \${t}\`))}catch(t){m||(m="async"),g=t}}if(!d){_("qerror",{importError:m,error:g,...v}),console.error(g);break}const w=t.__q_context__;if(e.isConnected)try{t.__q_context__=[e,o,f];const n=d(o,e);p(n)&&await n}catch(t){_("qerror",{error:t,...v})}finally{t.__q_context__=w}}}},_=(e,n)=>{t.dispatchEvent(q(e,n))},d=t=>t.replace(/([A-Z-])/g,t=>"-"+t.toLowerCase()),m=async(t,e)=>{let n=d(t.type),o=t.target;if(e!==i)for(;o&&o.getAttribute;){const e=h(o,"",t,n);let r=t.cancelBubble;p(e)&&await e,r||(r=r||t.cancelBubble||o.hasAttribute("stoppropagation:"+t.type)),o=t.bubbles&&!0!==r?o.parentElement:null}else u(i,t,n)},g=t=>{u(s,t,d(t.type))},y=()=>{const r=t.readyState;if(!a&&("interactive"==r||"complete"==r)&&(o.forEach(f),a=1,_("qinit"),(e.requestIdleCallback??e.setTimeout).bind(e)(()=>_("qidle")),n.has(":qvisible"))){const t=l("[on\\\\:qvisible]"),e=new IntersectionObserver(t=>{for(const n of t)n.isIntersecting&&(e.unobserve(n.target),h(n.target,"",q("qvisible",n)))});t.forEach(t=>e.observe(t))}},v=(t,e,n,o=!1)=>{t.addEventListener(e,n,{capture:o,passive:!1})},w=t=>t.replace(/-./g,t=>t[1].toUpperCase()),E=t=>{const e=t.indexOf(":");let n="",o=t;if(e>=0){const r=t.substring(0,e);""!==r&&r!==s&&r!==i||(n=r,o=t.substring(e+1))}return{scope:n,eventName:w(o)}},A=(...t)=>{for(const r of t)if("string"==typeof r){if(!n.has(r)){n.add(r);const{scope:t,eventName:i}=E(r);t===s?v(e,i,g,!0):o.forEach(e=>v(e,i,e=>m(e,t),!0))}}else o.has(r)||(n.forEach(t=>{const{scope:e,eventName:n}=E(t);v(r,n,t=>m(t,e),!0)}),o.add(r))};if(!("__q_context__"in t)){t.__q_context__=0;const r=e.qwikevents;r&&(Array.isArray(r)?A(...r):A("click","input")),e.qwikevents={events:n,roots:o,push:A},v(t,"readystatechange",y),y()}"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
