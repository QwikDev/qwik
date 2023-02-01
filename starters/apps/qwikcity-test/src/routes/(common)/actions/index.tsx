import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { SecretForm } from './login';

// export const slowAction = action$(async (form) => {
//   await delay(3000);
//   return {
//     success: true,
//   };
// });

// export const toppingsAction = action$((form) => {
//   const newToppings = form.toppings;
//   console.warn('Selected toppings:', newToppings);
//   // await delay(1000);
//   return {
//     success: true,
//   };
// });

// export const crustLoader = loader$(() => {
//   return ['Thin', 'Deep Dish'];
// });

// export const sizeLoader = loader$(() => {
//   return ['Small', 'Medium', 'Large'];
// });

export default component$(() => {
  // const crusts = crustLoader.use();
  // const sizes = sizeLoader.use();

  // const toppings = toppingsLoader.use();
  // const toppingAction = toppingsAction.use();
  // const slow = slowAction.use();

  return (
    <div class="actions">
      <section class="input">
        <SecretForm />
      </section>
    </div>
  );
});

export const head: DocumentHead = () => {
  return {
    title: 'Actions',
  };
};
