import { component$ } from '@qwik.dev/core';

export const ListItem = component$<{ item: number }>(({ item }) => (
  <li>
    <output data-testid="result" data-done="">
      {item}
    </output>
  </li>
));
