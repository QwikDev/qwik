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
      1789,
      4218,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const e=document,t=window,n="w",o="wp",r="d",s="dp",i="e",a="ep",c="capture:",l=new Set,q=new Set([e]),d=new Map;let p,f;const b=(e,t)=>Array.from(e.querySelectorAll(t)),h=e=>{const t=[];return q.forEach(n=>t.push(...b(n,e))),t},u=(e,t,n,o=!1,r=!1)=>e.addEventListener(t,n,{capture:o,passive:r}),g=e=>{D(e);const t=b(e,"[q\\\\:shadowroot]");for(let e=0;e<t.length;e++){const n=t[e].shadowRoot;n&&g(n)}},m=e=>e&&"function"==typeof e.then,v=t=>{if(void 0===t._qwikjson_){let n=(t===e.documentElement?e.body:t).lastElementChild;for(;n;){if("SCRIPT"===n.tagName&&"qwik/json"===n.getAttribute("type")){t._qwikjson_=JSON.parse(n.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}n=n.previousElementSibling}}},w=(e,t)=>new CustomEvent(e,{detail:t}),y=(t,n)=>{e.dispatchEvent(w(t,n))},A=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),E=e=>e.replace(/-./g,e=>e[1].toUpperCase()),C=e=>{const t=e.indexOf(":");return{scope:e.slice(0,t),eventName:E(e.slice(t+1))}},_=e=>2===e.length,k=e=>e.charAt(0),S=e=>!!e&&1===e.nodeType,I=(e,t,n)=>e.hasAttribute(n)&&(!!e._qDispatch?.[t]||e.hasAttribute("q-"+t)),N=async(t,n,o,r,s=!0)=>{r&&(s&&t.hasAttribute("preventdefault:"+r)&&n.preventDefault(),t.hasAttribute("stoppropagation:"+r)&&n.stopPropagation());const i=t._qDispatch?.[o];if(i){if("function"==typeof i){const e=i(n,t);m(e)&&await e}else if(i.length)for(let e=0;e<i.length;e++){const o=i[e],r=o?.(n,t);m(r)&&await r}return}const a=t.getAttribute("q-"+o);if(a){const o=t.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),r=o.getAttribute("q:base"),s=new URL(r,e.baseURI),i=a.split("|");for(let a=0;a<i.length;a++){const c=i[a],l=performance.now(),[q,p,f]=c.split("#"),b={qBase:r,symbol:p,element:t,reqTime:l};let h,u,g;if(""===q){const t=o.getAttribute("q:instance");h=(e["qFuncs_"+t]||[])[Number.parseInt(p)],h||(u="sync",g=Error("sym:"+p))}else{const e=\`\${p}|\${r}|\${q}\`;if(h=d.get(e),!h){const t=new URL(q,s).href;try{const n=import(t);v(o),h=(await n)[p],h?(d.set(e,h),y("qsymbol",b)):(u="no-symbol",g=Error(\`\${p} not in \${t}\`))}catch(e){u="async",g=e}}}if(h){if(t.isConnected)try{const e=h.call(f,n,t);m(e)&&await e}catch(e){y("qerror",{error:e,...b})}}else y("qerror",{importError:u,error:g,...b}),console.error(g)}}},$=async(e,t=i,n=!0)=>{const o=A(e.type),r=t+":"+o,s=c+o,a=[],l=[];let q=e.target;for(;q;)S(q)?(a.push(q),l.push(I(q,r,s)),q=q.parentElement):q=q.parentElement;for(let t=a.length-1;t>=0;t--)if(l[t]){const s=N(a[t],e,r,o,n),i=!e.cancelBubble;if(m(s)&&await s,!i||e.cancelBubble)return}for(let t=0;t<a.length;t++)if(!l[t]){const s=N(a[t],e,r,o,n),i=e.bubbles&&!e.cancelBubble;if(m(s)&&await s,!i||e.cancelBubble)return}},B=e=>$(e,a,!1),R=(e,t,n=!0)=>{const o=A(t.type),r=e+":"+o,s=h("[q-"+e+"\\\\:"+o+"]");for(let e=0;e<s.length;e++){const i=s[e];N(i,t,r,o,n)}},x=async e=>{R(r,e)},L=async e=>{R(s,e,!1)},T=e=>{R(n,e)},U=e=>{R(o,e,!1)},j=()=>{const n=e.readyState;if("interactive"==n||"complete"==n){if(f=1,q.forEach(g),l.has("d:qinit")){l.delete("d:qinit");const e=w("qinit"),t=h("[q-d\\\\:qinit]");for(let n=0;n<t.length;n++){const o=t[n];N(o,e,"d:qinit"),o.removeAttribute("q-d:qinit")}}if(l.has("d:qidle")&&(l.delete("d:qidle"),(t.requestIdleCallback??t.setTimeout).bind(t)(()=>{const e=w("qidle"),t=h("[q-d\\\\:qidle]");for(let n=0;n<t.length;n++){const o=t[n];N(o,e,"d:qidle"),o.removeAttribute("q-d:qidle")}})),l.has("e:qvisible")){p||(p=new IntersectionObserver(e=>{for(let t=0;t<e.length;t++){const n=e[t];n.isIntersecting&&(p.unobserve(n.target),N(n.target,w("qvisible",n),"e:qvisible"))}}));const e=h("[q-e\\\\:qvisible]:not([q\\\\:observed])");for(let t=0;t<e.length;t++){const n=e[t];p.observe(n),n.setAttribute("q:observed","true")}}}},D=(...e)=>{for(let o=0;o<e.length;o++){const s=e[o];if("string"==typeof s){if(!l.has(s)){l.add(s);const{scope:e,eventName:o}=C(s),i=_(e),a=k(e);a===n?u(t,o,i?U:T,!0,i):q.forEach(e=>u(e,o,a===r?i?L:x:i?B:$,!0,i)),1!==f||"e:qvisible"!==s&&"d:qinit"!==s&&"d:qidle"!==s||j()}}else q.has(s)||(l.forEach(e=>{const{scope:t,eventName:o}=C(e),i=_(t),a=k(t);a!==n&&u(s,o,a===r?i?L:x:i?B:$,!0,i)}),q.add(s))}},O=t._qwikEv;O?.roots||(Array.isArray(O)?D(...O):D("e:click","e:input"),t._qwikEv={events:l,roots:q,push:D},u(e,"readystatechange",j),j());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
