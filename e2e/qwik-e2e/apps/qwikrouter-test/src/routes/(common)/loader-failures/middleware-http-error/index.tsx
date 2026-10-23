import { component$ } from '@qwik.dev/core';
import { routeLoader$, type RequestHandler } from '@qwik.dev/router';
import { HttpError } from '@qwik.dev/router/middleware/request-handler';

export const onRequest: RequestHandler = () => {
  throw new HttpError(403, 'Members only');
};

export const useReviews = routeLoader$(() => ['great'], { blockSSR: false });

export default component$(() => {
  const reviews = useReviews();
  return <p id="reviews">{reviews.value.join(',')}</p>;
});
