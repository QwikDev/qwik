import { component$, useStylesScoped$ } from '@qwik.dev/core';

export const StyledCard = component$(() => {
  useStylesScoped$(`
    .styled-card {
      border: 2px solid teal;
      padding: 4px;
    }
  `);
  return (
    <div class="styled-card">
      <output data-testid="result" data-done="">
        styled
      </output>
    </div>
  );
});
