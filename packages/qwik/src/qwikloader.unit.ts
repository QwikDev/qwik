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
      1998,
      4703,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const e=document,t=window,n="w",r="wp",o="d",i="dp",s="e",l="ep",c="capture:",a=new Set,f=new Set([e]),p=new Map;let u,h,d=Promise.resolve();const q=(e,t)=>Array.from(e.querySelectorAll(t)),b=e=>{const t=[];return f.forEach(n=>t.push(...q(n,e))),t},g=(e,t,n,r=!1,o=!1)=>e.addEventListener(t,n,{capture:r,passive:o}),v=e=>{B(e);const t=q(e,"[q\\\\:shadowroot]");for(let e=0;e<t.length;e++){const n=t[e].shadowRoot;n&&v(n)}},m=e=>e&&"function"==typeof e.then,y=e=>d=d.then(e,e),w=t=>{if(void 0===t._qwikjson_){let n=(t===e.documentElement?e.body:t).lastElementChild;for(;n;){if("SCRIPT"===n.tagName&&"qwik/json"===n.getAttribute("type")){t._qwikjson_=JSON.parse(n.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}n=n.previousElementSibling}}},A=(e,t)=>new CustomEvent(e,{detail:t}),E=(t,n)=>{e.dispatchEvent(A(t,n))},C=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),_=e=>e.replace(/-./g,e=>e[1].toUpperCase()),k=e=>{const t=e.indexOf(":");return{scope:e.slice(0,t),eventName:_(e.slice(t+1))}},S=e=>2===e.length,$=e=>e.charAt(0),I=e=>!!e&&1===e.nodeType,N=(e,t,n)=>e.hasAttribute(n)&&(!!e._qDispatch?.[t]||e.hasAttribute("q-"+t)),P=(t,n,r,o,i=!0)=>{o&&(i&&t.hasAttribute("preventdefault:"+o)&&n.preventDefault(),t.hasAttribute("stoppropagation:"+o)&&n.stopPropagation());const s=t._qDispatch?.[r];if(s){if("function"==typeof s)return s(n,t);const e=(r=0)=>{for(let o=r;o<s.length;o++){const r=s[o]?.(n,t);if(m(r))return r.then(()=>e(o+1))}};return e()}const l=t.getAttribute("q-"+r);if(l){const r=t.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),o=r.getAttribute("q:base"),i=new URL(o,e.baseURI),s=l.split("|"),c=(l=0)=>{for(let a=l;a<s.length;a++){const[l,f,u]=s[a].split("#"),h={qBase:o,symbol:f,element:t,reqTime:performance.now()},d=(e,t)=>{t?(E("qerror",{importError:t,error:e,...h}),console.error(e)):E("qerror",{error:e,...h})},q=e=>{if(t.isConnected)try{const r=e.call(u,n,t);return m(r)?r.catch(d):r}catch(e){d(e)}};let b;if(""===l){const t=r.getAttribute("q:instance");b=(e["qFuncs_"+t]||[])[+f],b||d(Error("sym:"+f),"sync")}else{const e=\`\${f}|\${o}|\${l}\`;if(b=p.get(e),!b){const t=new URL(l,i).href;w(r),b=import(t).then(n=>{const r=n[f];if(r)return p.set(e,r),E("qsymbol",h),r;d(Error(\`\${f} not in \${t}\`),"no-symbol")},e=>{d(e,"async")})}}if(m(b))return b.then(e=>{if(e){const t=q(e);if(m(t))return t.then(()=>c(a+1))}return c(a+1)});if(b){const e=q(b);if(m(e))return e.then(()=>c(a+1))}}};return c()}},R=(e,t=s,n=!0)=>{const r=C(e.type),o=t+":"+r,i=c+r,l="stoppropagation:"+r,a="preventdefault:"+r,f=[],p=e.stopPropagation;let u=0;e.stopPropagation=function(){return u=1,p.call(this)};let h=-1,d=-1,q=!1,b=e.target;for(;b;)if(I(b)){const e=N(b,o,i);f.push(b),n&&b.hasAttribute(a)&&(q=!0),b.hasAttribute(l)&&(e?h=f.length-1:d<0&&(d=f.length-1)),b=b.parentElement}else b=b.parentElement;if(!f.length)return;q&&e.preventDefault(),(~h||~d)&&p.call(e);const g=(t,n,r,s,l)=>{for(let c=t;c!==n;c+=r)if(N(f[c],o,i)===s){const t=P(f[c],e,o);if(m(t))return y(()=>t.then(()=>{if(!u&&c!==l)return g(c+r,n,r,s,l)}));if(u||c===l)return}},v=g(f.length-1,-1,-1,!0,h);return m(v)?v:u||~h?void 0:g(0,e.bubbles?f.length:1,1,!1,d)},x=e=>R(e,l,!1),D=(e,t,n=!0)=>{const r=C(t.type),o=e+":"+r,i=b("[q-"+e+"\\\\:"+r+"]");for(let e=0;e<i.length;e++){const s=i[e];P(s,t,o,r,n)}},L=e=>{D(o,e)},T=e=>{D(i,e,!1)},U=e=>{D(n,e)},j=e=>{D(r,e,!1)},O=()=>{const n=e.readyState;if("interactive"==n||"complete"==n){if(h=1,f.forEach(v),a.has("d:qinit")){a.delete("d:qinit");const e=A("qinit"),t=b("[q-d\\\\:qinit]");for(let n=0;n<t.length;n++){const r=t[n];P(r,e,"d:qinit"),r.removeAttribute("q-d:qinit")}}if(a.has("d:qidle")&&(a.delete("d:qidle"),(t.requestIdleCallback??t.setTimeout).bind(t)(()=>{const e=A("qidle"),t=b("[q-d\\\\:qidle]");for(let n=0;n<t.length;n++){const r=t[n];P(r,e,"d:qidle"),r.removeAttribute("q-d:qidle")}})),a.has("e:qvisible")){u||(u=new IntersectionObserver(e=>{for(let t=0;t<e.length;t++){const n=e[t];n.isIntersecting&&(u.unobserve(n.target),P(n.target,A("qvisible",n),"e:qvisible"))}}));const e=b("[q-e\\\\:qvisible]:not([q\\\\:observed])");for(let t=0;t<e.length;t++){const n=e[t];u.observe(n),n.setAttribute("q:observed","true")}}}},B=(...e)=>{for(let r=0;r<e.length;r++){const i=e[r];if("string"==typeof i){if(!a.has(i)){a.add(i);const{scope:e,eventName:r}=k(i),s=S(e),l=$(e);l===n?g(t,r,s?j:U,!0,s):f.forEach(e=>g(e,r,l===o?s?T:L:s?x:R,!0,s)),1!==h||"e:qvisible"!==i&&"d:qinit"!==i&&"d:qidle"!==i||O()}}else f.has(i)||(a.forEach(e=>{const{scope:t,eventName:r}=k(e),s=S(t),l=$(t);l!==n&&g(i,r,l===o?s?T:L:s?x:R,!0,s)}),f.add(i))}},F=t._qwikEv;F?.roots||(Array.isArray(F)?B(...F):B("e:click","e:input"),t._qwikEv={events:a,roots:f,push:B},g(e,"readystatechange",O),O());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
