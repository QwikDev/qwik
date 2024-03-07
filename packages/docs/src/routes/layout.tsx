import { component$, Slot } from '@builder.io/qwik';
import { routeLoader$, type RequestHandler } from '@builder.io/qwik-city';



export const useOgParamsloader = routeLoader$( (request)  => {

  request
  // request
  // console.log( request.params )
return request.params
} )

export default component$(() => {
  return <Slot />;
});

export const onGet: RequestHandler = ({ cacheControl }) => {
  // cache for pages using this layout
  cacheControl({
    public: true,
    maxAge: 3600,
    sMaxAge: 3600,
    staleWhileRevalidate: 86400,
  });
};
