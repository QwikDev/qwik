export const ServiceWorker = (props?: ServiceWorkerProps) => {
  const url = props?.url || '/sw.js';

  return (
    <script
      dangerouslySetInnerHTML={`(()=>{
let sw=null,q=[],s=(p)=>sw.active&&sw.active.postMessage({qprefetchsymbols:p});
addEventListener("qprefetchsymbols",e=>{sw?s(e.detail):q&&q.push(...e.detail)});
navigator.serviceWorker.register("${url}").then(r=>{
const i=()=>{sw=r;s(q);q=0};if(r.installing){r.installing.addEventListener("statechange",(e)=>{e.target.state=="activated"&&i()})}else if(r.active){i()}
});
})()
`}
    />
  );
};

export interface ServiceWorkerProps {
  url?: string;
}
