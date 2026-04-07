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
      1685,
      3895,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const e=document,t=window,n="w",o="wp",r="d",s="dp",i="e",a="ep",c=new Set,l=new Set([e]),d=new Map;let q,p;const b=(e,t)=>Array.from(e.querySelectorAll(t)),f=e=>{const t=[];return l.forEach(n=>t.push(...b(n,e))),t},u=(e,t,n,o=!1,r=!1)=>e.addEventListener(t,n,{capture:o,passive:r}),h=e=>{j(e);const t=b(e,"[q\\\\:shadowroot]");for(let e=0;e<t.length;e++){const n=t[e].shadowRoot;n&&h(n)}},g=e=>e&&"function"==typeof e.then,m=t=>{if(void 0===t._qwikjson_){let n=(t===e.documentElement?e.body:t).lastElementChild;for(;n;){if("SCRIPT"===n.tagName&&"qwik/json"===n.getAttribute("type")){t._qwikjson_=JSON.parse(n.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}n=n.previousElementSibling}}},v=(e,t)=>new CustomEvent(e,{detail:t}),w=(t,n)=>{e.dispatchEvent(v(t,n))},y=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),A=e=>e.replace(/-./g,e=>e[1].toUpperCase()),E=e=>{const t=e.indexOf(":");return{scope:e.slice(0,t),eventName:A(e.slice(t+1))}},C=e=>2===e.length,k=e=>e.charAt(0),_=async(t,n,o,r,s=!0)=>{r&&(s&&t.hasAttribute("preventdefault:"+r)&&n.preventDefault(),t.hasAttribute("stoppropagation:"+r)&&n.stopPropagation());const i=t._qDispatch?.[o];if(i){if("function"==typeof i){const e=i(n,t);g(e)&&await e}else if(i.length)for(let e=0;e<i.length;e++){const o=i[e],r=o?.(n,t);g(r)&&await r}return}const a=t.getAttribute("q-"+o);if(a){const o=t.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),r=o.getAttribute("q:base"),s=new URL(r,e.baseURI),i=a.split("|");for(let a=0;a<i.length;a++){const c=i[a],l=performance.now(),[q,p,b]=c.split("#"),f={qBase:r,symbol:p,element:t,reqTime:l};let u,h,v;if(""===q){const t=o.getAttribute("q:instance");u=(e["qFuncs_"+t]||[])[Number.parseInt(p)],u||(h="sync",v=Error("sym:"+p))}else{const e=\`\${p}|\${r}|\${q}\`;if(u=d.get(e),!u){const t=new URL(q,s).href;try{const n=import(t);m(o),u=(await n)[p],u?(d.set(e,u),w("qsymbol",f)):(h="no-symbol",v=Error(\`\${p} not in \${t}\`))}catch(e){h="async",v=e}}}if(u){if(t.isConnected)try{const e=u.call(b,n,t);g(e)&&await e}catch(e){w("qerror",{error:e,...f})}}else w("qerror",{importError:h,error:v,...f}),console.error(v)}}},S=async(e,t=i,n=!0)=>{const o=y(e.type),r=t+":"+o;let s=e.target;for(;s&&s.getAttribute;){const t=_(s,e,r,o,n),i=e.bubbles&&!e.cancelBubble;g(t)&&await t,s=i&&e.bubbles&&!e.cancelBubble?s.parentElement:null}},I=e=>S(e,a,!1),N=(e,t,n=!0)=>{const o=y(t.type),r=e+":"+o,s=f("[q-"+e+"\\\\:"+o+"]");for(let e=0;e<s.length;e++){const i=s[e];_(i,t,r,o,n)}},$=async e=>{N(r,e)},R=async e=>{N(s,e,!1)},x=e=>{N(n,e)},L=e=>{N(o,e,!1)},U=()=>{const n=e.readyState;if("interactive"==n||"complete"==n){if(p=1,l.forEach(h),c.has("d:qinit")){c.delete("d:qinit");const e=v("qinit"),t=f("[q-d\\\\:qinit]");for(let n=0;n<t.length;n++){const o=t[n];_(o,e,"d:qinit"),o.removeAttribute("q-d:qinit")}}if(c.has("d:qidle")&&(c.delete("d:qidle"),(t.requestIdleCallback??t.setTimeout).bind(t)(()=>{const e=v("qidle"),t=f("[q-d\\\\:qidle]");for(let n=0;n<t.length;n++){const o=t[n];_(o,e,"d:qidle"),o.removeAttribute("q-d:qidle")}})),c.has("e:qvisible")){q||(q=new IntersectionObserver(e=>{for(let t=0;t<e.length;t++){const n=e[t];n.isIntersecting&&(q.unobserve(n.target),_(n.target,v("qvisible",n),"e:qvisible"))}}));const e=f("[q-e\\\\:qvisible]:not([q\\\\:observed])");for(let t=0;t<e.length;t++){const n=e[t];q.observe(n),n.setAttribute("q:observed","true")}}}},j=(...e)=>{for(let o=0;o<e.length;o++){const s=e[o];if("string"==typeof s){if(!c.has(s)){c.add(s);const{scope:e,eventName:o}=E(s),i=C(e),a=k(e);a===n?u(t,o,i?L:x,!0,i):l.forEach(e=>u(e,o,a===r?i?R:$:i?I:S,!0,i)),1!==p||"e:qvisible"!==s&&"d:qinit"!==s&&"d:qidle"!==s||U()}}else l.has(s)||(c.forEach(e=>{const{scope:t,eventName:o}=E(e),i=C(t),a=k(t);a!==n&&u(s,o,a===r?i?R:$:i?I:S,!0,i)}),l.add(s))}},B=t._qwikEv;B?.roots||(Array.isArray(B)?j(...B):j("e:click","e:input"),t._qwikEv={events:c,roots:l,push:j},u(e,"readystatechange",U),U());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
