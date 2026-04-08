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
      1764,
      4195,
    ]
  `);

  expect(qwikLoader).toMatchInlineSnapshot(
    `"var e,t,n=document,r=window,o="w",s="wp",i="d",a="dp",c="e",l="ep",q="capture:",d=new Set,p=new Set([n]),f=new Map,b=(e,t)=>Array.from(e.querySelectorAll(t)),h=e=>{const t=[];return p.forEach(n=>t.push(...b(n,e))),t},u=(e,t,n,r=!1,o=!1)=>e.addEventListener(t,n,{capture:r,passive:o}),g=e=>{D(e);const t=b(e,"[q\\\\:shadowroot]");for(let e=0;e<t.length;e++){const n=t[e].shadowRoot;n&&g(n)}},m=e=>e&&"function"==typeof e.then,v=e=>{if(void 0===e._qwikjson_){let t=(e===n.documentElement?n.body:e).lastElementChild;for(;t;){if("SCRIPT"===t.tagName&&"qwik/json"===t.getAttribute("type")){e._qwikjson_=JSON.parse(t.textContent.replace(/\\\\x3C(\\/?script)/gi,"<$1"));break}t=t.previousElementSibling}}},w=(e,t)=>new CustomEvent(e,{detail:t}),y=(e,t)=>{n.dispatchEvent(w(e,t))},A=e=>e.replace(/([A-Z-])/g,e=>"-"+e.toLowerCase()),E=e=>e.replace(/-./g,e=>e[1].toUpperCase()),C=e=>{const t=e.indexOf(":");return{scope:e.slice(0,t),eventName:E(e.slice(t+1))}},_=e=>2===e.length,k=e=>e.charAt(0),S=e=>!!e&&1===e.nodeType,I=(e,t,n)=>e.hasAttribute(n)&&(!!e._qDispatch?.[t]||e.hasAttribute("q-"+t)),N=async(e,t,r,o,s=!0)=>{o&&(s&&e.hasAttribute("preventdefault:"+o)&&t.preventDefault(),e.hasAttribute("stoppropagation:"+o)&&t.stopPropagation());const i=e._qDispatch?.[r];if(i){if("function"==typeof i){const n=i(t,e);m(n)&&await n}else if(i.length)for(let n=0;n<i.length;n++){const r=i[n],o=r?.(t,e);m(o)&&await o}return}const a=e.getAttribute("q-"+r);if(a){const r=e.closest("[q\\\\:container]:not([q\\\\:container=html]):not([q\\\\:container=text])"),o=r.getAttribute("q:base"),s=new URL(o,n.baseURI),i=a.split("|");for(let a=0;a<i.length;a++){const c=i[a],l=performance.now(),[q,d,p]=c.split("#"),b={qBase:o,symbol:d,element:e,reqTime:l};let h,u,g;if(""===q)h=(n["qFuncs_"+r.getAttribute("q:instance")]||[])[Number.parseInt(d)],h||(u="sync",g=Error("sym:"+d));else{const e=\`\${d}|\${o}|\${q}\`;if(h=f.get(e),!h){const t=new URL(q,s).href;try{const n=import(t);v(r),h=(await n)[d],h?(f.set(e,h),y("qsymbol",b)):(u="no-symbol",g=Error(\`\${d} not in \${t}\`))}catch(e){u="async",g=e}}}if(h){if(e.isConnected)try{const n=h.call(p,t,e);m(n)&&await n}catch(e){y("qerror",{error:e,...b})}}else y("qerror",{importError:u,error:g,...b}),console.error(g)}}},$=async(e,t=c,n=!0)=>{const r=A(e.type),o=t+":"+r,s=q+r,i=[],a=[];let l=e.target;for(;l;)S(l)?(i.push(l),a.push(I(l,o,s)),l=l.parentElement):l=l.parentElement;for(let t=i.length-1;t>=0;t--)if(a[t]){const s=N(i[t],e,o,r,n),a=!e.cancelBubble;if(m(s)&&await s,!a||e.cancelBubble)return}for(let t=0;t<i.length;t++)if(!a[t]){const s=N(i[t],e,o,r,n),a=e.bubbles&&!e.cancelBubble;if(m(s)&&await s,!a||e.cancelBubble)return}},B=e=>$(e,l,!1),R=(e,t,n=!0)=>{const r=A(t.type),o=e+":"+r,s=h("[q-"+e+"\\\\:"+r+"]");for(let e=0;e<s.length;e++){const i=s[e];N(i,t,o,r,n)}},x=async e=>{R(i,e)},L=async e=>{R(a,e,!1)},T=e=>{R(o,e)},U=e=>{R(s,e,!1)},j=()=>{const o=n.readyState;if("interactive"==o||"complete"==o){if(t=1,p.forEach(g),d.has("d:qinit")){d.delete("d:qinit");const e=w("qinit"),t=h("[q-d\\\\:qinit]");for(let n=0;n<t.length;n++){const r=t[n];N(r,e,"d:qinit"),r.removeAttribute("q-d:qinit")}}if(d.has("d:qidle")&&(d.delete("d:qidle"),(r.requestIdleCallback??r.setTimeout).bind(r)(()=>{const e=w("qidle"),t=h("[q-d\\\\:qidle]");for(let n=0;n<t.length;n++){const r=t[n];N(r,e,"d:qidle"),r.removeAttribute("q-d:qidle")}})),d.has("e:qvisible")){e||(e=new IntersectionObserver(t=>{for(let n=0;n<t.length;n++){const r=t[n];r.isIntersecting&&(e.unobserve(r.target),N(r.target,w("qvisible",r),"e:qvisible"))}}));const t=h("[q-e\\\\:qvisible]:not([q\\\\:observed])");for(let n=0;n<t.length;n++){const r=t[n];e.observe(r),r.setAttribute("q:observed","true")}}}},D=(...e)=>{for(let n=0;n<e.length;n++){const s=e[n];if("string"==typeof s){if(!d.has(s)){d.add(s);const{scope:e,eventName:n}=C(s),a=_(e),c=k(e);c===o?u(r,n,a?U:T,!0,a):p.forEach(e=>u(e,n,c===i?a?L:x:a?B:$,!0,a)),1!==t||"e:qvisible"!==s&&"d:qinit"!==s&&"d:qidle"!==s||j()}}else p.has(s)||(d.forEach(e=>{const{scope:t,eventName:n}=C(e),r=_(t),a=k(t);a!==o&&u(s,n,a===i?r?L:x:r?B:$,!0,r)}),p.add(s))}},O=r._qwikEv;O?.roots||(Array.isArray(O)?D(...O):D("e:click","e:input"),r._qwikEv={events:d,roots:p,push:D},u(n,"readystatechange",j),j());"`
  );
});

// Keep this the same as in qwikloader.ts
const kebabToCamel = (eventName: string) => eventName.replace(/-./g, (a) => a[1].toUpperCase());
test('kebab-to-camel event names', () => {
  expect(kebabToCamel('-custom-event')).toBe('CustomEvent');
  expect(kebabToCamel('--custom---event')).toBe('-custom-Event');
});
