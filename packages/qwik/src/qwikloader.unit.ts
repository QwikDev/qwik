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
  expect(compressed.length).toBe(1444);
  expect(qwikLoader.length).toBe(3148);
  expect(qwikLoader).toMatchInlineSnapshot(
    `"(()=>{const t=document,e=window,n=new Set,o=new Set([t]);let r;const s=(t,e)=>Array.from(t.querySelectorAll(e)),a=t=>{const e=[];return o.forEach((n=>e.push(...s(n,t)))),e},i=t=>{w(t),s(t,"[q\\\\:shadowroot]").forEach((t=>{const e=t.shadowRoot;e&&i(e)}))},c=t=>t&&"function"==typeof t.then,l=(t,e,n=e.type)=>{a("[on"+t+"\\\\:"+n+"]").forEach((o=>u(o,t,e,n)))},f=e=>{if(void 0===e._qwikjson_){let n=(e===t.documentElement?t.body:e).lastElementChild;for(;n;){if("SCRIPT"===n.tagName&&"qwik/json"===n.getAttribute("type")){e._qwikjson_=JSON.parse(n.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}n=n.previousElementSibling}}},p=(t,e)=>new CustomEvent(t,{detail:e}),u=async(e,n,o,r=o.type)=>{const s="on"+n+":"+r;e.hasAttribute("preventdefault:"+r)&&o.preventDefault(),e.hasAttribute("stoppropagation:"+r)&&o.stopPropagation();const a=e._qc_,i=a&&a.li.filter((t=>t[0]===s));if(i&&i.length>0){for(const t of i){const n=t[1].getFn([e,o],(()=>e.isConnected))(o,e),r=o.cancelBubble;c(n)&&await n,r&&o.stopPropagation()}return}const l=e.getAttribute(s);if(l){const n=e.closest("[q\\\\:container]"),r=n.getAttribute("q:base"),s=n.getAttribute("q:version")||"unknown",a=n.getAttribute("q:manifest-hash")||"dev",i=new URL(r,t.baseURI);for(const p of l.split("\\n")){const l=new URL(p,i),u=l.href,h=l.hash.replace(/^#?([^?[|]*).*$/,"$1")||"default",_=performance.now();let q,d,y;const g=p.startsWith("#"),w={qBase:r,qManifest:a,qVersion:s,href:u,symbol:h,element:e,reqTime:_};if(g){const e=n.getAttribute("q:instance");q=(t["qFuncs_"+e]||[])[Number.parseInt(h)],q||(d="sync",y=Error("sym:"+h))}else{const t=l.href.split("#")[0];try{const e=import(t);f(n),q=(await e)[h],q||(d="no-symbol",y=Error(\`\${h} not in \${t}\`))}catch(t){d||(d="async"),y=t}}if(!q){b("qerror",{importError:d,error:y,...w}),console.error(y);break}const m=t.__q_context__;if(e.isConnected)try{t.__q_context__=[e,o,l],g||b("qsymbol",{...w});const n=q(o,e);c(n)&&await n}catch(t){b("qerror",{error:t,...w})}finally{t.__q_context__=m}}}},b=(e,n)=>{t.dispatchEvent(p(e,n))},h=t=>t.replace(/([A-Z])/g,(t=>"-"+t.toLowerCase())),_=async t=>{let e=h(t.type),n=t.target;for(l("-document",t,e);n&&n.getAttribute;){const o=u(n,"",t,e);let r=t.cancelBubble;c(o)&&await o,r=r||t.cancelBubble||n.hasAttribute("stoppropagation:"+t.type),n=t.bubbles&&!0!==r?n.parentElement:null}},q=t=>{l("-window",t,h(t.type))},d=t=>{const e=a(\`[on\\\\:\${t}]\`);if(e.length){const n=new IntersectionObserver((e=>{for(const o of e)o.isIntersecting&&(n.unobserve(o.target),u(o.target,"",p(t,o)))}));e.forEach((t=>n.observe(t)))}},y=()=>{var n;const s=t.readyState;r||"interactive"!=s&&"complete"!=s||(o.forEach(i),r=1,b("qinit"),(null!=(n=e.requestIdleCallback)?n:e.setTimeout).bind(e)((()=>{b("qidle"),d("qidlevisible")})),d("qvisible"))},g=(t,e,n,o=!1)=>t.addEventListener(e,n,{capture:o,passive:!1}),w=(...t)=>{for(const r of t)"string"==typeof r?n.has(r)||(o.forEach((t=>g(t,r,_,!0))),g(e,r,q,!0),n.add(r)):o.has(r)||(n.forEach((t=>g(r,t,_,!0))),o.add(r))};if(!("__q_context__"in t)){t.__q_context__=0;const r=e.qwikevents;Array.isArray(r)&&w(...r),e.qwikevents={events:n,roots:o,push:w},g(t,"readystatechange",y),y()}})();"`
  );
});
