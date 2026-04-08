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
      1943,
      4913,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const e=document,t=window,r="w",n="wp",o="d",s="dp",i="e",c="ep",l="capture:",a=new Set,p=new Set([e]),q=new Map;let u,f,h;const d=(e,t)=>Array.from(e.querySelectorAll(t)),b=e=>{const t=[];return p.forEach(r=>t.push(...d(r,e))),t},m=(e,t,r,n=!1,o=!1)=>e.addEventListener(t,r,{capture:n,passive:o}),g=e=>{J(e);const t=d(e,"[q\\\\:shadowroot]");for(let e=0;e<t.length;e++){const r=t[e].shadowRoot;r&&g(r)}},v=e=>e&&"function"==typeof e.then,y=async e=>{for(let t=0;t<e.length;t++)await e[t]()},w=e=>{if(e.length){const t=()=>y(e);h=h?h.then(t,t):t()}},E=t=>{if(void 0===t._qwikjson_){let r=(t===e.documentElement?e.body:t).lastElementChild;for(;r;){if("SCRIPT"===r.tagName&&"qwik/json"===r.getAttribute("type")){t._qwikjson_=JSON.parse(r.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}r=r.previousElementSibling}}},A=(e,t)=>new CustomEvent(e,{detail:t}),C=(t,r)=>{e.dispatchEvent(A(t,r))},_=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),k=e=>e.replace(/-./g,e=>e[1].toUpperCase()),B=e=>{const t=e.indexOf(":");return{scope:e.slice(0,t),eventName:k(e.slice(t+1))}},S=e=>2===e.length,I=e=>e.charAt(0),N=e=>!!e&&1===e.nodeType,T=(e,t,r)=>e.hasAttribute(r)&&(!!e._qDispatch?.[t]||e.hasAttribute("q-"+t)),$=(t,r,n,o,s,i,c)=>{const l={qBase:n,symbol:i,element:r,reqTime:c};if(""===s){const r=t.getAttribute("q:instance"),n=(e["qFuncs_"+r]||[])[Number.parseInt(i)];if(!n){const e=Error("sym:"+i);C("qerror",{importError:"sync",error:e,...l}),console.error(e)}return n}const a=\`\${i}|\${n}|\${s}\`,p=q.get(a);if(p)return p;const u=new URL(s,o).href,f=import(u);return E(t),f.then(e=>{const t=e[i];if(t)q.set(a,t),C("qsymbol",l);else{const e=Error(\`\${i} not in \${u}\`);C("qerror",{importError:"no-symbol",error:e,...l}),console.error(e)}return t},e=>{C("qerror",{importError:"async",error:e,...l}),console.error(e)})},R=(t,r,n,o,s,i=!0)=>{let c=!1;s&&(i&&t.hasAttribute("preventdefault:"+s)&&r.preventDefault(),t.hasAttribute("stoppropagation:"+s)&&r.stopPropagation());const l=t._qDispatch?.[n];if(l){if("function"==typeof l){const e=()=>l(r,t);if(c)o.push(async()=>{const t=e();v(t)&&await t});else{const t=e();v(t)&&(c=!0,o.push(()=>t))}}else if(l.length)for(let e=0;e<l.length;e++){const n=l[e];if(n){const e=()=>n(r,t);if(c)o.push(async()=>{const t=e();v(t)&&await t});else{const t=e();v(t)&&(c=!0,o.push(()=>t))}}}return}const a=t.getAttribute("q-"+n);if(a){const n=t.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),s=n.getAttribute("q:base"),i=new URL(s,e.baseURI),l=a.split("|");for(let e=0;e<l.length;e++){const a=l[e],p=performance.now(),[q,u,f]=a.split("#"),h=e=>{if(e&&t.isConnected)try{const n=e.call(f,r,t);if(v(n))return n.catch(e=>{C("qerror",{error:e,qBase:s,symbol:u,element:t,reqTime:p})})}catch(e){C("qerror",{error:e,qBase:s,symbol:u,element:t,reqTime:p})}},d=$(n,t,s,i,q,u,p);if(c||v(d))c=!0,o.push(async()=>{await h(v(d)?await d:d)});else{const e=h(d);v(e)&&(c=!0,o.push(()=>e))}}}},x=(e,t=i,r=!0)=>{const n=_(e.type),o=t+":"+n,s=l+n,c=[],a=[],p=[];let q=e.target;for(;q;)N(q)?(c.push(q),a.push(T(q,o,s)),q=q.parentElement):q=q.parentElement;for(let t=c.length-1;t>=0;t--)if(a[t]&&(R(c[t],e,o,p,n,r),e.cancelBubble||e.cancelBubble))return void w(p);for(let t=0;t<c.length;t++)if(!a[t]&&(R(c[t],e,o,p,n,r),!e.bubbles||e.cancelBubble||e.cancelBubble))return void w(p);w(p)},L=e=>x(e,c,!1),U=(e,t,r=!0)=>{const n=_(t.type),o=e+":"+n,s=b("[q-"+e+"\\\\:"+n+"]"),i=[];for(let e=0;e<s.length;e++){const c=s[e];R(c,t,o,i,n,r)}w(i)},j=e=>{U(o,e)},D=e=>{U(s,e,!1)},O=e=>{U(r,e)},P=e=>{U(n,e,!1)},F=()=>{const r=e.readyState;if("interactive"==r||"complete"==r){if(f=1,p.forEach(g),a.has("d:qinit")){a.delete("d:qinit");const e=A("qinit"),t=b("[q-d\\\\:qinit]"),r=[];for(let n=0;n<t.length;n++){const o=t[n];R(o,e,"d:qinit",r),o.removeAttribute("q-d:qinit")}w(r)}if(a.has("d:qidle")&&(a.delete("d:qidle"),(t.requestIdleCallback??t.setTimeout).bind(t)(()=>{const e=A("qidle"),t=b("[q-d\\\\:qidle]"),r=[];for(let n=0;n<t.length;n++){const o=t[n];R(o,e,"d:qidle",r),o.removeAttribute("q-d:qidle")}w(r)})),a.has("e:qvisible")){u||(u=new IntersectionObserver(e=>{const t=[];for(let r=0;r<e.length;r++){const n=e[r];n.isIntersecting&&(u.unobserve(n.target),R(n.target,A("qvisible",n),"e:qvisible",t))}w(t)}));const e=b("[q-e\\\\:qvisible]:not([q\\\\:observed])");for(let t=0;t<e.length;t++){const r=e[t];u.observe(r),r.setAttribute("q:observed","true")}}}},J=(...e)=>{for(let n=0;n<e.length;n++){const s=e[n];if("string"==typeof s){if(!a.has(s)){a.add(s);const{scope:e,eventName:n}=B(s),i=S(e),c=I(e);c===r?m(t,n,i?P:O,!0,i):p.forEach(e=>m(e,n,c===o?i?D:j:i?L:x,!0,i)),1!==f||"e:qvisible"!==s&&"d:qinit"!==s&&"d:qidle"!==s||F()}}else p.has(s)||(a.forEach(e=>{const{scope:t,eventName:n}=B(e),i=S(t),c=I(t);c!==r&&m(s,n,c===o?i?D:j:i?L:x,!0,i)}),p.add(s))}},M=t._qwikEv;M?.roots||(Array.isArray(M)?J(...M):J("e:click","e:input"),t._qwikEv={events:a,roots:p,push:J},m(e,"readystatechange",F),F());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
