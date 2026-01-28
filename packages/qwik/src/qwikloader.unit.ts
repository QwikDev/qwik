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
      1509,
      3259,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const t=document,e=window,o=new Set,n=new Set([t]),r={},s="-window",a="-document";let i;const c=(t,e)=>Array.from(t.querySelectorAll(e)),l=t=>{const e=[];return n.forEach(o=>e.push(...c(o,t))),e},p=t=>{C(t),c(t,"[q\\\\:shadowroot]").forEach(t=>{const e=t.shadowRoot;e&&p(e)})},f=t=>t&&"function"==typeof t.then,u=(t,e,o=e.type)=>{l("[on"+t+"\\\\:"+o+"]").forEach(n=>{d(n,t,e,o)})},b=e=>{if(void 0===e._qwikjson_){let o=(e===t.documentElement?t.body:e).lastElementChild;for(;o;){if("SCRIPT"===o.tagName&&"qwik/json"===o.getAttribute("type")){e._qwikjson_=JSON.parse(o.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}o=o.previousElementSibling}}},h=(t,e)=>new CustomEvent(t,{detail:e}),d=async(e,o,n,s=n.type)=>{const a="on"+o+":"+s;e.hasAttribute("preventdefault:"+s)&&n.preventDefault(),e.hasAttribute("stoppropagation:"+s)&&n.stopPropagation();const i=e._qc_,c=i&&i.li.filter(t=>t[0]===a);if(c&&c.length>0){for(const t of c){const o=t[1].getFn([e,n],()=>e.isConnected)(n,e),r=n.cancelBubble;f(o)&&await o,r&&n.stopPropagation()}return}const l=e.qDispatchEvent;if(l)return l(n,o);const p=e.getAttribute(a);if(p){const o=e.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),s=o.getAttribute("q:base");for(const a of p.split("\\n")){const[i,c,l]=a.split("#"),p=performance.now();let u,h,d;const q=a.startsWith("#"),y=s+i,g={qBase:s,href:a,symbol:c,element:e,reqTime:p};if(q){const e=o.getAttribute("q:instance");u=(t["qFuncs_"+e]||[])[Number.parseInt(c)],u||(h="sync",d=Error("sym:"+c))}else if(u=r[y]?.[c]);else try{const t=import(y);b(o),u=(await t)[c],u?(r[y]||(r[y]={}))[c]=u:(h="no-symbol",d=Error(\`\${c} not in \${y}\`))}catch(t){h||(h="async"),d=t}if(!u){m("qerror",{importError:h,error:d,...g}),console.error(d);break}if(e.isConnected)try{q||m("qsymbol",g);const t=u.call(l,n,e);f(t)&&await t}catch(t){m("qerror",{error:t,...g})}}}},m=(e,o)=>{t.dispatchEvent(h(e,o))},q=t=>t.replace(/([A-Z-])/g,t=>"-"+t.toLowerCase()),y=async(t,e)=>{let o=q(t.type),n=t.target;if(e!==a)for(;n&&n.getAttribute;){const e=d(n,"",t,o);let r=t.cancelBubble;f(e)&&await e,r||(r=r||t.cancelBubble||n.hasAttribute("stoppropagation:"+t.type)),n=t.bubbles&&!0!==r?n.parentElement:null}else u(a,t,o)},g=t=>{u(s,t,q(t.type))},v=()=>{const r=t.readyState;if(!i&&("interactive"==r||"complete"==r)&&(n.forEach(p),i=1,m("qinit"),(e.requestIdleCallback??e.setTimeout).bind(e)(()=>m("qidle")),o.has(":qvisible"))){const t=l("[on\\\\:qvisible]"),e=new IntersectionObserver(t=>{for(const o of t)o.isIntersecting&&(e.unobserve(o.target),d(o.target,"",h("qvisible",o)))});t.forEach(t=>e.observe(t))}},w=(t,e,o,n=!1)=>{t.addEventListener(e,o,{capture:n,passive:!1})},E=t=>t.replace(/-./g,t=>t[1].toUpperCase()),A=t=>{const e=t.indexOf(":");let o="",n=t;if(e>=0){const r=t.substring(0,e);""!==r&&r!==s&&r!==a||(o=r,n=t.substring(e+1))}return{scope:o,eventName:E(n)}},C=(...t)=>{for(const r of t)if("string"==typeof r){if(!o.has(r)){o.add(r);const{scope:t,eventName:a}=A(r);t===s?w(e,a,g,!0):n.forEach(e=>w(e,a,e=>y(e,t),!0))}}else n.has(r)||(o.forEach(t=>{const{scope:e,eventName:o}=A(t);w(r,o,t=>y(t,e),!0)}),n.add(r))},k=e.qwikevents;k?.roots||(k&&(Array.isArray(k)?C(...k):C(":click",":input")),e.qwikevents={events:o,roots:n,push:C},w(t,"readystatechange",v),v());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
