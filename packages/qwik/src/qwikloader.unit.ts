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
      1928,
      4897,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"var e,t,r,n=document,o=window,s="w",i="wp",c="d",l="dp",a="e",p="ep",q="capture:",u=new Set,f=new Set([n]),h=new Map,d=(e,t)=>Array.from(e.querySelectorAll(t)),b=e=>{const t=[];return f.forEach(r=>t.push(...d(r,e))),t},m=(e,t,r,n=!1,o=!1)=>e.addEventListener(t,r,{capture:n,passive:o}),g=e=>{J(e);const t=d(e,"[q\\\\:shadowroot]");for(let e=0;e<t.length;e++){const r=t[e].shadowRoot;r&&g(r)}},v=e=>e&&"function"==typeof e.then,y=async e=>{for(let t=0;t<e.length;t++)await e[t]()},w=e=>{if(e.length){const t=()=>y(e);r=r?r.then(t,t):t()}},E=e=>{if(void 0===e._qwikjson_){let t=(e===n.documentElement?n.body:e).lastElementChild;for(;t;){if("SCRIPT"===t.tagName&&"qwik/json"===t.getAttribute("type")){e._qwikjson_=JSON.parse(t.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}t=t.previousElementSibling}}},A=(e,t)=>new CustomEvent(e,{detail:t}),C=(e,t)=>{n.dispatchEvent(A(e,t))},_=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),k=e=>e.replace(/-./g,e=>e[1].toUpperCase()),B=e=>{const t=e.indexOf(":");return{scope:e.slice(0,t),eventName:k(e.slice(t+1))}},S=e=>2===e.length,I=e=>e.charAt(0),N=e=>!!e&&1===e.nodeType,T=(e,t,r)=>e.hasAttribute(r)&&(!!e._qDispatch?.[t]||e.hasAttribute("q-"+t)),$=(e,t,r,o,s,i,c)=>{const l={qBase:r,symbol:i,element:t,reqTime:c};if(""===s){const t=(n["qFuncs_"+e.getAttribute("q:instance")]||[])[Number.parseInt(i)];if(!t){const e=Error("sym:"+i);C("qerror",{importError:"sync",error:e,...l}),console.error(e)}return t}const a=\`\${i}|\${r}|\${s}\`,p=h.get(a);if(p)return p;const q=new URL(s,o).href,u=import(q);return E(e),u.then(e=>{const t=e[i];if(t)h.set(a,t),C("qsymbol",l);else{const e=Error(\`\${i} not in \${q}\`);C("qerror",{importError:"no-symbol",error:e,...l}),console.error(e)}return t},e=>{C("qerror",{importError:"async",error:e,...l}),console.error(e)})},R=(e,t,r,o,s,i=!0)=>{let c=!1;s&&(i&&e.hasAttribute("preventdefault:"+s)&&t.preventDefault(),e.hasAttribute("stoppropagation:"+s)&&t.stopPropagation());const l=e._qDispatch?.[r];if(l){if("function"==typeof l){const r=()=>l(t,e);if(c)o.push(async()=>{const e=r();v(e)&&await e});else{const e=r();v(e)&&(c=!0,o.push(()=>e))}}else if(l.length)for(let r=0;r<l.length;r++){const n=l[r];if(n){const r=()=>n(t,e);if(c)o.push(async()=>{const e=r();v(e)&&await e});else{const e=r();v(e)&&(c=!0,o.push(()=>e))}}}return}const a=e.getAttribute("q-"+r);if(a){const r=e.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),s=r.getAttribute("q:base"),i=new URL(s,n.baseURI),l=a.split("|");for(let n=0;n<l.length;n++){const a=l[n],p=performance.now(),[q,u,f]=a.split("#"),h=r=>{if(r&&e.isConnected)try{const n=r.call(f,t,e);if(v(n))return n.catch(t=>{C("qerror",{error:t,qBase:s,symbol:u,element:e,reqTime:p})})}catch(t){C("qerror",{error:t,qBase:s,symbol:u,element:e,reqTime:p})}},d=$(r,e,s,i,q,u,p);if(c||v(d))c=!0,o.push(async()=>{await h(v(d)?await d:d)});else{const e=h(d);v(e)&&(c=!0,o.push(()=>e))}}}},x=(e,t=a,r=!0)=>{const n=_(e.type),o=t+":"+n,s=q+n,i=[],c=[],l=[];let p=e.target;for(;p;)N(p)?(i.push(p),c.push(T(p,o,s)),p=p.parentElement):p=p.parentElement;for(let t=i.length-1;t>=0;t--)if(c[t]&&(R(i[t],e,o,l,n,r),e.cancelBubble||e.cancelBubble))return void w(l);for(let t=0;t<i.length;t++)if(!c[t]&&(R(i[t],e,o,l,n,r),!e.bubbles||e.cancelBubble||e.cancelBubble))return void w(l);w(l)},L=e=>x(e,p,!1),U=(e,t,r=!0)=>{const n=_(t.type),o=e+":"+n,s=b("[q-"+e+"\\\\:"+n+"]"),i=[];for(let e=0;e<s.length;e++){const c=s[e];R(c,t,o,i,n,r)}w(i)},j=e=>{U(c,e)},D=e=>{U(l,e,!1)},O=e=>{U(s,e)},P=e=>{U(i,e,!1)},F=()=>{const r=n.readyState;if("interactive"==r||"complete"==r){if(t=1,f.forEach(g),u.has("d:qinit")){u.delete("d:qinit");const e=A("qinit"),t=b("[q-d\\\\:qinit]"),r=[];for(let n=0;n<t.length;n++){const o=t[n];R(o,e,"d:qinit",r),o.removeAttribute("q-d:qinit")}w(r)}if(u.has("d:qidle")&&(u.delete("d:qidle"),(o.requestIdleCallback??o.setTimeout).bind(o)(()=>{const e=A("qidle"),t=b("[q-d\\\\:qidle]"),r=[];for(let n=0;n<t.length;n++){const o=t[n];R(o,e,"d:qidle",r),o.removeAttribute("q-d:qidle")}w(r)})),u.has("e:qvisible")){e||(e=new IntersectionObserver(t=>{const r=[];for(let n=0;n<t.length;n++){const o=t[n];o.isIntersecting&&(e.unobserve(o.target),R(o.target,A("qvisible",o),"e:qvisible",r))}w(r)}));const t=b("[q-e\\\\:qvisible]:not([q\\\\:observed])");for(let r=0;r<t.length;r++){const n=t[r];e.observe(n),n.setAttribute("q:observed","true")}}}},J=(...e)=>{for(let r=0;r<e.length;r++){const n=e[r];if("string"==typeof n){if(!u.has(n)){u.add(n);const{scope:e,eventName:r}=B(n),i=S(e),l=I(e);l===s?m(o,r,i?P:O,!0,i):f.forEach(e=>m(e,r,l===c?i?D:j:i?L:x,!0,i)),1!==t||"e:qvisible"!==n&&"d:qinit"!==n&&"d:qidle"!==n||F()}}else f.has(n)||(u.forEach(e=>{const{scope:t,eventName:r}=B(e),o=S(t),i=I(t);i!==s&&m(n,r,i===c?o?D:j:o?L:x,!0,o)}),f.add(n))}},M=o._qwikEv;M?.roots||(Array.isArray(M)?J(...M):J("e:click","e:input"),o._qwikEv={events:u,roots:f,push:J},m(n,"readystatechange",F),F());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
