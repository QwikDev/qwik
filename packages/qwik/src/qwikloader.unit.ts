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
      1515,
      3308,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const t=document,e=window,n=new Set,o=new Set([t]),r={};let s;const i=(t,e)=>Array.from(t.querySelectorAll(e)),a=t=>{const e=[];return o.forEach(n=>e.push(...i(n,t))),e},c=t=>{w(t),i(t,"[q\\\\:shadowroot]").forEach(t=>{const e=t.shadowRoot;e&&c(e)})},l=t=>t&&"function"==typeof t.then,f=(t,e,n=e.type)=>{a("[on"+t+"\\\\:"+n+"]").forEach(o=>{b(o,t,e,n)})},p=e=>{if(void 0===e._qwikjson_){let n=(e===t.documentElement?t.body:e).lastElementChild;for(;n;){if("SCRIPT"===n.tagName&&"qwik/json"===n.getAttribute("type")){e._qwikjson_=JSON.parse(n.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}n=n.previousElementSibling}}},u=(t,e)=>new CustomEvent(t,{detail:e}),b=async(e,n,o,s=o.type)=>{const i="on"+n+":"+s;e.hasAttribute("preventdefault:"+s)&&o.preventDefault(),e.hasAttribute("stoppropagation:"+s)&&o.stopPropagation();const a=e._qc_,c=a&&a.li.filter(t=>t[0]===i);if(c&&c.length>0){for(const t of c){const n=t[1].getFn([e,o],()=>e.isConnected)(o,e),r=o.cancelBubble;l(n)&&await n,r&&o.stopPropagation()}return}const f=e.getAttribute(i),u=e.qDispatchEvent;if(u)return u(o,n);if(f){const n=e.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),s=n.getAttribute("q:base"),i=n.getAttribute("q:version")||"unknown",a=n.getAttribute("q:manifest-hash")||"dev",c=new URL(s,t.baseURI);for(const u of f.split("\\n")){const f=new URL(u,c),b=f.href,h=f.hash.replace(/^#?([^?[|]*).*$/,"$1")||"default",_=performance.now();let d,y,g;const m=u.startsWith("#"),w={qBase:s,qManifest:a,qVersion:i,href:b,symbol:h,element:e,reqTime:_};if(m){const e=n.getAttribute("q:instance");d=(t["qFuncs_"+e]||[])[Number.parseInt(h)],d||(y="sync",g=Error("sym:"+h))}else if(h in r)d=r[h];else{q("qsymbol",w);const t=f.href.split("#")[0];try{const e=import(t);p(n),d=(await e)[h],d?r[h]=d:(y="no-symbol",g=Error(\`\${h} not in \${t}\`))}catch(t){y||(y="async"),g=t}}if(!d){q("qerror",{importError:y,error:g,...w}),console.error(g);break}const v=t.__q_context__;if(e.isConnected)try{t.__q_context__=[e,o,f];const n=d(o,e);l(n)&&await n}catch(t){q("qerror",{error:t,...w})}finally{t.__q_context__=v}}}},q=(e,n)=>{t.dispatchEvent(u(e,n))},h=t=>t.replace(/([A-Z-])/g,t=>"-"+t.toLowerCase()),_=async t=>{let e=h(t.type),n=t.target;for(f("-document",t,e);n&&n.getAttribute;){const o=b(n,"",t,e);let r=t.cancelBubble;l(o)&&await o,r||(r=r||t.cancelBubble||n.hasAttribute("stoppropagation:"+t.type)),n=t.bubbles&&!0!==r?n.parentElement:null}},d=t=>{f("-window",t,h(t.type))},y=()=>{const r=t.readyState;if(!s&&("interactive"==r||"complete"==r)&&(o.forEach(c),s=1,q("qinit"),(e.requestIdleCallback??e.setTimeout).bind(e)(()=>q("qidle")),n.has("qvisible"))){const t=a("[on\\\\:qvisible]"),e=new IntersectionObserver(t=>{for(const n of t)n.isIntersecting&&(e.unobserve(n.target),b(n.target,"",u("qvisible",n)))});t.forEach(t=>e.observe(t))}},g=(t,e,n,o=!1)=>{t.addEventListener(e,n,{capture:o,passive:!1})},m=t=>t.replace(/-./g,t=>t[1].toUpperCase()),w=(...t)=>{for(const r of t)if("string"==typeof r){if(!n.has(r)){n.add(r);const t=m(r);o.forEach(e=>g(e,t,_,!0)),g(e,t,d,!0)}}else o.has(r)||(n.forEach(t=>{const e=m(t);g(r,e,_,!0)}),o.add(r))};if(!("__q_context__"in t)){t.__q_context__=0;const r=e.qwikevents;r&&(Array.isArray(r)?w(...r):w("click","input")),e.qwikevents={events:n,roots:o,push:w},g(t,"readystatechange",y),y()}"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
