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
      1583,
      3660,
      1537,
      3435,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"const e=document,t=window,n="w",o="d",r=new Set,s=new Set([e]),i=new Map;let a,c;const l=(e,t)=>Array.from(e.querySelectorAll(t)),q=e=>{const t=[];return s.forEach(n=>t.push(...l(n,e))),t},d=(e,t,n,o=!1)=>e.addEventListener(t,n,{capture:o,passive:!1}),b=e=>{_(e);const t=l(e,"[q\\\\:shadowroot]");for(let e=0;e<t.length;e++){const n=t[e].shadowRoot;n&&b(n)}},f=e=>e&&"function"==typeof e.then,p=t=>{if(void 0===t._qwikjson_){let n=(t===e.documentElement?e.body:t).lastElementChild;for(;n;){if("SCRIPT"===n.tagName&&"qwik/json"===n.getAttribute("type")){t._qwikjson_=JSON.parse(n.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}n=n.previousElementSibling}}},u=(e,t)=>new CustomEvent(e,{detail:t}),h=(t,n)=>{e.dispatchEvent(u(t,n))},g=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),m=e=>e.replace(/-./g,e=>e[1].toUpperCase()),v=e=>({scope:e.charAt(0),eventName:m(e.slice(2))}),w=async(t,n,o,r)=>{r&&(t.hasAttribute("preventdefault:"+r)&&n.preventDefault(),t.hasAttribute("stoppropagation:"+r)&&n.stopPropagation());const s=t._qDispatch?.[o];if(s){if("function"==typeof s){const e=s(n,t);f(e)&&await e}else if(s.length)for(let e=0;e<s.length;e++){const o=s[e],r=o?.(n,t);f(r)&&await r}return}const a=t.getAttribute("q-"+o);if(a){const o=t.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),r=o.getAttribute("q:base"),s=new URL(r,e.baseURI),c=a.split("|");for(let a=0;a<c.length;a++){const l=c[a],q=performance.now(),[d,b,u]=l.split("#"),g={qBase:r,symbol:b,element:t,reqTime:q};let m,v,w;if(""===d){const t=o.getAttribute("q:instance");m=(e["qFuncs_"+t]||[])[Number.parseInt(b)],m||(v="sync",w=Error("sym:"+b))}else{const e=\`\${b}|\${r}|\${d}\`;if(m=i.get(e),!m){const t=new URL(d,s).href;try{const n=import(t);p(o),m=(await n)[b],m?(i.set(e,m),h("qsymbol",g)):(v="no-symbol",w=Error(\`\${b} not in \${t}\`))}catch(e){v="async",w=e}}}if(m){if(t.isConnected)try{const e=m.call(u,n,t);f(e)&&await e}catch(e){h("qerror",{error:e,...g})}}else h("qerror",{importError:v,error:w,...g}),console.error(w)}}},y=async e=>{const t=g(e.type),n="e:"+t;let o=e.target;for(;o&&o.getAttribute;){const r=w(o,e,n,t),s=e.bubbles&&!e.cancelBubble;f(r)&&await r,o=s&&e.bubbles&&!e.cancelBubble?o.parentElement:null}},A=(e,t)=>{const n=g(t.type),o=e+":"+n,r=q("[q-"+e+"\\\\:"+n+"]");for(let e=0;e<r.length;e++){const s=r[e];w(s,t,o,n)}},E=async e=>{A(o,e)},C=e=>{A(n,e)},k=()=>{const n=e.readyState;if("interactive"==n||"complete"==n){if(c=1,s.forEach(b),r.has("d:qinit")){r.delete("d:qinit");const e=u("qinit"),t=q("[q-d\\\\:qinit]");for(let n=0;n<t.length;n++){const o=t[n];w(o,e,"d:qinit"),o.removeAttribute("q-d:qinit")}}if(r.has("d:qidle")&&(r.delete("d:qidle"),(t.requestIdleCallback??t.setTimeout).bind(t)(()=>{const e=u("qidle"),t=q("[q-d\\\\:qidle]");for(let n=0;n<t.length;n++){const o=t[n];w(o,e,"d:qidle"),o.removeAttribute("q-d:qidle")}})),r.has("e:qvisible")){a||(a=new IntersectionObserver(e=>{for(let t=0;t<e.length;t++){const n=e[t];n.isIntersecting&&(a.unobserve(n.target),w(n.target,u("qvisible",n),"e:qvisible"))}}));const e=q("[q-e\\\\:qvisible]:not([q\\\\:observed])");for(let t=0;t<e.length;t++){const n=e[t];a.observe(n),n.setAttribute("q:observed","true")}}}},_=(...e)=>{for(let i=0;i<e.length;i++){const a=e[i];if("string"==typeof a){if(!r.has(a)){r.add(a);const{scope:e,eventName:i}=v(a);e===n?d(t,i,C,!0):s.forEach(t=>d(t,i,e===o?E:y,!0)),1!==c||"e:qvisible"!==a&&"d:qinit"!==a&&"d:qidle"!==a||k()}}else s.has(a)||(r.forEach(e=>{const{scope:t,eventName:r}=v(e);t!==n&&d(a,r,t===o?E:y,!0)}),s.add(a))}},S=t._qwikEv;S?.roots||(Array.isArray(S)?_(...S):_("e:click","e:input"),t._qwikEv={events:r,roots:s,push:_},d(e,"readystatechange",k),k());"``"var e,t,o=document,r=window,n="w",i="d",s=new Set,a=new Set([o]),c=new Map,l=(e,t)=>Array.from(e.querySelectorAll(t)),q=e=>{const t=[];return a.forEach(o=>t.push(...l(o,e))),t},d=(e,t,o,r=!1)=>e.addEventListener(t,o,{capture:r,passive:!1}),b=e=>{_(e),l(e,"[q\\\\:shadowroot]").forEach(e=>{const t=e.shadowRoot;t&&b(t)})},f=e=>e&&"function"==typeof e.then,p=e=>{if(void 0===e._qwikjson_){let t=(e===o.documentElement?o.body:e).lastElementChild;for(;t;){if("SCRIPT"===t.tagName&&"qwik/json"===t.getAttribute("type")){e._qwikjson_=JSON.parse(t.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}t=t.previousElementSibling}}},u=(e,t)=>new CustomEvent(e,{detail:t}),h=(e,t)=>{o.dispatchEvent(u(e,t))},v=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),m=e=>e.replace(/-./g,e=>e[1].toUpperCase()),w=e=>({scope:e.charAt(0),eventName:m(e.slice(2))}),y=async(e,t,r,n)=>{n&&(e.hasAttribute("preventdefault:"+n)&&t.preventDefault(),e.hasAttribute("stoppropagation:"+n)&&t.stopPropagation());const i=e._qDispatch?.[r];if(i){if("function"==typeof i){const o=i(t,e);f(o)&&await o}else if(i.length)for(let o=0;o<i.length;o++){const r=i[o],n=r?.(t,e);f(n)&&await n}return}const s=e.getAttribute("q-"+r);if(s){const r=e.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),n=r.getAttribute("q:base"),i=new URL(n,o.baseURI);for(const a of s.split("|")){const s=performance.now(),[l,q,d]=a.split("#"),b={qBase:n,symbol:q,element:e,reqTime:s};let u,v,m;if(""===l)u=(o["qFuncs_"+r.getAttribute("q:instance")]||[])[Number.parseInt(q)],u||(v="sync",m=Error("sym:"+q));else{const e=\`\${q}|\${n}|\${l}\`;if(u=c.get(e),!u){const t=new URL(l,i).href;try{const o=import(t);p(r),u=(await o)[q],u?(c.set(e,u),h("qsymbol",b)):(v="no-symbol",m=Error(\`\${q} not in \${t}\`))}catch(e){v="async",m=e}}}if(u){if(e.isConnected)try{const o=u.call(d,t,e);f(o)&&await o}catch(e){h("qerror",{error:e,...b})}}else h("qerror",{importError:v,error:m,...b}),console.error(m)}}},g=async e=>{const t=v(e.type),o="e:"+t;let r=e.target;for(;r&&r.getAttribute;){const n=y(r,e,o,t),i=e.bubbles&&!e.cancelBubble;f(n)&&await n,r=i&&e.bubbles&&!e.cancelBubble?r.parentElement:null}},E=(e,t)=>{const o=v(t.type),r=e+":"+o;q("[q-"+e+"\\\\:"+o+"]").forEach(e=>y(e,t,r,o))},A=async e=>{E(i,e)},C=e=>{E(n,e)},k=()=>{const n=o.readyState;if("interactive"==n||"complete"==n){if(t=1,a.forEach(b),s.has("d:qinit")){s.delete("d:qinit");const e=u("qinit");q("[q-d\\\\:qinit]").forEach(t=>{y(t,e,"d:qinit"),t.removeAttribute("q-d:qinit")})}s.has("d:qidle")&&(s.delete("d:qidle"),(r.requestIdleCallback??r.setTimeout).bind(r)(()=>{const e=u("qidle");q("[q-d\\\\:qidle]").forEach(t=>{y(t,e,"d:qidle"),t.removeAttribute("q-d:qidle")})})),s.has("e:qvisible")&&(e||(e=new IntersectionObserver(t=>{for(const o of t)o.isIntersecting&&(e.unobserve(o.target),y(o.target,u("qvisible",o),"e:qvisible"))})),q("[q-e\\\\:qvisible]:not([q\\\\:observed])").forEach(t=>{e.observe(t),t.setAttribute("q:observed","true")}))}},_=(...e)=>{for(let o=0;o<e.length;o++){const c=e[o];if("string"==typeof c){if(!s.has(c)){s.add(c);const{scope:e,eventName:o}=w(c);e===n?d(r,o,C,!0):a.forEach(t=>d(t,o,e===i?A:g,!0)),1!==t||"e:qvisible"!==c&&"d:qinit"!==c&&"d:qidle"!==c||k()}}else a.has(c)||(s.forEach(e=>{const{scope:t,eventName:o}=w(e);t!==n&&d(c,o,t===i?A:g,!0)}),a.add(c))}},S=r._qwikEv;S?.roots||(Array.isArray(S)?_(...S):_("e:click","e:input"),r._qwikEv={events:s,roots:a,push:_},d(o,"readystatechange",k),k());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
