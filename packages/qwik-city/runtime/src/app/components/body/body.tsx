import { component$ } from '@builder.io/qwik';
import { RouterOutlet } from '~qwik-city-runtime';

export const Body = component$(
  () => {
    return (
      <div>
        <RouterOutlet />
      </div>
    );
  },
  { tagName: 'body' }
);
