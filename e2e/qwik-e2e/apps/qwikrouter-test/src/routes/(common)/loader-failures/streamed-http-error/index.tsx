import { Catch, component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import { HttpError } from '@qwik.dev/router/middleware/request-handler';

export const useReviews = routeLoader$(
  (): string[] => {
    throw new HttpError(404, 'No such review');
  },
  { blockSSR: false }
);

const Reviews = component$(() => {
  const reviews = useReviews().value;
  return <p id="reviews">{reviews.join(',')}</p>;
});

export default component$(() => {
  return (
    <Catch fallback$={(error) => <p id="catch-fallback">caught: {error.message}</p>}>
      <Reviews />
    </Catch>
  );
});
