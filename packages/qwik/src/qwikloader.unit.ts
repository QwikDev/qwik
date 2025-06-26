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
  expect([compressed.length, qwikLoader.length]).toEqual([1535, 3358]);
  expect(qwikLoader).toMatchInlineSnapshot(
    `"const t=document,e=window,n=new Set,o=new Set([t]);let r;const s=(t,e)=>Array.from(t.querySelectorAll(e)),i=t=>{const e=[];return o.forEach(n=>e.push(...s(n,t))),e},a=t=>{v(t),s(t,"[q\\\\:shadowroot]").forEach(t=>{const e=t.shadowRoot;e&&a(e)})},c=t=>t&&"function"==typeof t.then;let l=!0;const f=(t,e,n=e.type)=>{let o=l;i("[on"+t+"\\\\:"+n+"]").forEach(r=>{o=!0,b(r,t,e,n)}),o||window[t.slice(1)].removeEventListener(n,"-window"===t?d:_)},p=e=>{if(void 0===e._qwikjson_){let n=(e===t.documentElement?t.body:e).lastElementChild;for(;n;){if("SCRIPT"===n.tagName&&"qwik/json"===n.getAttribute("type")){e._qwikjson_=JSON.parse(n.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}n=n.previousElementSibling}}},u=(t,e)=>new CustomEvent(t,{detail:e}),b=async(e,n,o,r=o.type)=>{const s="on"+n+":"+r;e.hasAttribute("preventdefault:"+r)&&o.preventDefault(),e.hasAttribute("stoppropagation:"+r)&&o.stopPropagation();const i=e._qc_,a=i&&i.li.filter(t=>t[0]===s);if(a&&a.length>0){for(const t of a){const n=t[1].getFn([e,o],()=>e.isConnected)(o,e),r=o.cancelBubble;c(n)&&await n,r&&o.stopPropagation()}return}const l=e.getAttribute(s),f=e.qDispatchEvent;if(f)return f(o,n);if(l){const n=e.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),r=n.getAttribute("q:base"),s=n.getAttribute("q:version")||"unknown",i=n.getAttribute("q:manifest-hash")||"dev",a=new URL(r,t.baseURI);for(const f of l.split("\\n")){const l=new URL(f,a),u=l.href,b=l.hash.replace(/^#?([^?[|]*).*$/,"$1")||"default",h=performance.now();let _,d,w;const m=f.startsWith("#"),y={qBase:r,qManifest:i,qVersion:s,href:u,symbol:b,element:e,reqTime:h};if(m){const e=n.getAttribute("q:instance");_=(t["qFuncs_"+e]||[])[Number.parseInt(b)],_||(d="sync",w=Error("sym:"+b))}else{q("qsymbol",y);const t=l.href.split("#")[0];try{const e=import(t);p(n),_=(await e)[b],_||(d="no-symbol",w=Error(\`\${b} not in \${t}\`))}catch(t){d||(d="async"),w=t}}if(!_){q("qerror",{importError:d,error:w,...y}),console.error(w);break}const v=t.__q_context__;if(e.isConnected)try{t.__q_context__=[e,o,l];const n=_(o,e);c(n)&&await n}catch(t){q("qerror",{error:t,...y})}finally{t.__q_context__=v}}}},q=(e,n)=>{t.dispatchEvent(u(e,n))},h=t=>t.replace(/([A-Z])/g,t=>"-"+t.toLowerCase()),_=async t=>{let e=h(t.type),n=t.target;for(f("-document",t,e);n&&n.getAttribute;){const o=b(n,"",t,e);let r=t.cancelBubble;c(o)&&await o,r||(r=r||t.cancelBubble||n.hasAttribute("stoppropagation:"+t.type)),n=t.bubbles&&!0!==r?n.parentElement:null}},d=t=>{f("-window",t,h(t.type))},w=()=>{var s;const c=t.readyState;if(!r&&("interactive"==c||"complete"==c)&&(o.forEach(a),r=1,q("qinit"),(null!=(s=e.requestIdleCallback)?s:e.setTimeout).bind(e)(()=>q("qidle")),n.has("qvisible"))){const t=i("[on\\\\:qvisible]"),e=new IntersectionObserver(t=>{for(const n of t)n.isIntersecting&&(e.unobserve(n.target),b(n.target,"",u("qvisible",n)))});t.forEach(t=>e.observe(t))}},m=(t,e,n,o=!1)=>{t.addEventListener(e,n,{capture:o,passive:!1})};let y;const v=(...t)=>{l=!0,clearTimeout(y),y=setTimeout(()=>l=!1,2e4);for(const r of t)"string"==typeof r?n.has(r)||(o.forEach(t=>m(t,r,_,!0)),m(e,r,d,!0),n.add(r)):o.has(r)||(n.forEach(t=>m(r,t,_,!0)),o.add(r))};if(!("__q_context__"in t)){t.__q_context__=0;const r=e.qwikevents;r&&(Array.isArray(r)?v(...r):v("click","input")),e.qwikevents={events:n,roots:o,push:v},m(t,"readystatechange",w),w()}"`
  );
});
