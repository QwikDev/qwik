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
      2028,
      5173,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const e=document,t=window,r="w",n="wp",o="d",s="dp",i="e",a="ep",c="capture:",l="readystatechange",p=new Set,q=new Set([e]),u=new Map;let d,f,h;const b=(e,t)=>Array.from(e.querySelectorAll(t)),m=e=>{const t=[];return q.forEach(r=>t.push(...b(r,e))),t},g=(e,t,r,n=!1,o=!1)=>e.addEventListener(t,r,{capture:n,passive:o}),v=e=>{Z(e);const t=b(e,"[q\\\\:shadowroot]");for(let e=0;e<t.length;e++){const r=t[e].shadowRoot;r&&v(r)}},w=e=>e&&"function"==typeof e.then,y=async e=>{for(let t=0;t<e.length;t++)await e[t]()},E=e=>{if(e.length){const t=()=>y(e);h=h?h.then(t,t):t()}},A=t=>{if(void 0===t._qwikjson_){let r=(t===e.documentElement?e.body:t).lastElementChild;for(;r;){if("SCRIPT"===r.tagName&&"qwik/json"===r.getAttribute("type")){t._qwikjson_=JSON.parse(r.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}r=r.previousElementSibling}}},C=t=>"paused"===t.getAttribute("q:container")&&"loading"===e.readyState?new Promise(t=>{const r=()=>{e.removeEventListener(l,r),t()};g(e,l,r)}):void 0,_=(e,t)=>new CustomEvent(e,{detail:t}),k=(t,r)=>{e.dispatchEvent(_(t,r))},S=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),B=e=>e.replace(/-./g,e=>e[1].toUpperCase()),I=e=>{const t=e.indexOf(":");return{scope:e.slice(0,t),eventName:B(e.slice(t+1))}},N=e=>2===e.length,T=e=>e.charAt(0),$=e=>!!e&&1===e.nodeType,L=(e,t,r)=>e.hasAttribute(r)&&(!!e._qDispatch?.[t]||e.hasAttribute("q-"+t)),R=(t,r,n,o,s,i,a)=>{const c={qBase:n,symbol:i,element:r,reqTime:a};if(""===s){const r=t.getAttribute("q:instance"),n=(e["qFuncs_"+r]||[])[Number.parseInt(i)];if(!n){const e=Error("sym:"+i);k("qerror",{importError:"sync",error:e,...c}),console.error(e)}return n}const l=\`\${i}|\${n}|\${s}\`,p=u.get(l);if(p)return p;const q=new URL(s,o).href,d=import(q);return A(t),d.then(e=>{const t=e[i];if(t)u.set(l,t),k("qsymbol",c);else{const e=Error(\`\${i} not in \${q}\`);k("qerror",{importError:"no-symbol",error:e,...c}),console.error(e)}return t},e=>{k("qerror",{importError:"async",error:e,...c}),console.error(e)})},x=(t,r,n,o,s,i=!0)=>{let a=!1;s&&(i&&t.hasAttribute("preventdefault:"+s)&&r.preventDefault(),t.hasAttribute("stoppropagation:"+s)&&r.stopPropagation());const c=t._qDispatch?.[n];if(c){if("function"==typeof c){const e=()=>c(r,t);if(a)o.push(async()=>{const t=e();w(t)&&await t});else{const t=e();w(t)&&(a=!0,o.push(()=>t))}}else if(c.length)for(let e=0;e<c.length;e++){const n=c[e];if(n){const e=()=>n(r,t);if(a)o.push(async()=>{const t=e();w(t)&&await t});else{const t=e();w(t)&&(a=!0,o.push(()=>t))}}}return}const l=t.getAttribute("q-"+n);if(l){const n=t.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),s=n.getAttribute("q:base"),i=new URL(s,e.baseURI),c=l.split("|"),p=C(n);for(let e=0;e<c.length;e++){const l=c[e],q=performance.now(),[u,d,f]=l.split("#"),h=e=>{if(e&&t.isConnected)try{const n=e.call(f,r,t);if(w(n))return n.catch(e=>{k("qerror",{error:e,qBase:s,symbol:d,element:t,reqTime:q})})}catch(e){k("qerror",{error:e,qBase:s,symbol:d,element:t,reqTime:q})}},b=()=>R(n,t,s,i,u,d,q),m=p&&""===u?void 0:b();if(w(m))a=!0,o.push(async()=>{p&&await p,await h(await m)});else if(a||p)a=!0,o.push(async()=>{p&&await p,await h(m||await b())});else{const e=h(m);w(e)&&(a=!0,o.push(()=>e))}}}},U=(e,t=i,r=!0)=>{const n=S(e.type),o=t+":"+n,s=c+n,a=[],l=[],p=[];let q=e.target;for(;q;)$(q)?(a.push(q),l.push(L(q,o,s)),q=q.parentElement):q=q.parentElement;for(let t=a.length-1;t>=0;t--)if(l[t]&&(x(a[t],e,o,p,n,r),e.cancelBubble||e.cancelBubble))return void E(p);for(let t=0;t<a.length;t++)if(!l[t]&&(x(a[t],e,o,p,n,r),!e.bubbles||e.cancelBubble||e.cancelBubble))return void E(p);E(p)},j=e=>U(e,a,!1),D=(e,t,r=!0)=>{const n=S(t.type),o=e+":"+n,s=m("[q-"+e+"\\\\:"+n+"]"),i=[];for(let e=0;e<s.length;e++){const a=s[e];x(a,t,o,i,n,r)}E(i)},O=e=>{D(o,e)},P=e=>{D(s,e,!1)},F=e=>{D(r,e)},J=e=>{D(n,e,!1)},M=()=>{const r=e.readyState;if("interactive"==r||"complete"==r){if(f=1,q.forEach(v),p.has("d:qinit")){p.delete("d:qinit");const e=_("qinit"),t=m("[q-d\\\\:qinit]"),r=[];for(let n=0;n<t.length;n++){const o=t[n];x(o,e,"d:qinit",r),o.removeAttribute("q-d:qinit")}E(r)}if(p.has("d:qidle")&&(p.delete("d:qidle"),(t.requestIdleCallback??t.setTimeout).bind(t)(()=>{const e=_("qidle"),t=m("[q-d\\\\:qidle]"),r=[];for(let n=0;n<t.length;n++){const o=t[n];x(o,e,"d:qidle",r),o.removeAttribute("q-d:qidle")}E(r)})),p.has("e:qvisible")){d||(d=new IntersectionObserver(e=>{const t=[];for(let r=0;r<e.length;r++){const n=e[r];n.isIntersecting&&(d.unobserve(n.target),x(n.target,_("qvisible",n),"e:qvisible",t))}E(t)}));const e=m("[q-e\\\\:qvisible]:not([q\\\\:observed])");for(let t=0;t<e.length;t++){const r=e[t];d.observe(r),r.setAttribute("q:observed","true")}}}},Z=(...e)=>{for(let n=0;n<e.length;n++){const s=e[n];if("string"==typeof s){if(!p.has(s)){p.add(s);const{scope:e,eventName:n}=I(s),i=N(e),a=T(e);a===r?g(t,n,i?J:F,!0,i):q.forEach(e=>g(e,n,a===o?i?P:O:i?j:U,!0,i)),1!==f||"e:qvisible"!==s&&"d:qinit"!==s&&"d:qidle"!==s||M()}}else q.has(s)||(p.forEach(e=>{const{scope:t,eventName:n}=I(e),i=N(t),a=T(t);a!==r&&g(s,n,a===o?i?P:O:i?j:U,!0,i)}),q.add(s))}},z=t._qwikEv;z?.roots||(Array.isArray(z)?Z(...z):Z("e:click","e:input"),t._qwikEv={events:p,roots:q,push:Z},g(e,l,M),M());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
