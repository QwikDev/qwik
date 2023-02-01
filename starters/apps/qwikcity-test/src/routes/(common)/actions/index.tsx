import { component$, useStyles$ } from '@builder.io/qwik';
import { DocumentHead, Form, action$, loader$ } from '@builder.io/qwik-city';
import styles from './actions.css';

export const toppingsLoader = loader$(() => {
  return ['Pepperoni', 'Sausage', 'Bacon'];
});

export function delay(nu: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, nu);
  });
}

export const slowAction = action$(async (form) => {
  await delay(3000);
  return {
    success: true,
  };
});

export const toppingsAction = action$((form) => {
  const newToppings = form.toppings;
  console.warn('Selected toppings:', newToppings);
  // await delay(1000);
  return {
    success: true,
  };
});

export const crustLoader = loader$(() => {
  return ['Thin', 'Deep Dish'];
});

export const sizeLoader = loader$(() => {
  return ['Small', 'Medium', 'Large'];
});

export default component$(() => {
  useStyles$(styles);

  const crusts = crustLoader.use();
  const sizes = sizeLoader.use();

  const toppings = toppingsLoader.use();
  const toppingAction = toppingsAction.use();
  const slow = slowAction.use();

  return (
    <div class="actions">
      <section class="input">
        <h1>Qwik Pizza</h1>

        <Form action={slow} data-test-slow>
          {slow.isRunning && <p>Slow action is running...</p>}
          <button disabled={slow.isRunning}>Send</button>
        </Form>

        <Form action={toppingAction} data-test-toppings>
          <h2>Toppings</h2>
          <p>
            {toppings.value
              .filter((s) => toppingAction.formData?.getAll('toppings[]').includes(s))
              .join(', ')}
          </p>
          {toppings.value.map((topping) => (
            <label>
              <input
                type="checkbox"
                name="toppings[]"
                value={topping}
                checked={toppingAction.formData?.getAll('toppings[]').includes(topping)}
              />
              <span>{topping}</span>
            </label>
          ))}
          <p>
            <button disabled={toppingAction.isRunning}>Set Toppings</button>
          </p>
        </Form>

        <form method="post" data-test-crust>
          <h2>Crust</h2>
          {crusts.value.map((crust) => (
            <label>
              <input type="radio" name="crust[]" value={crust} />
              <span>{crust}</span>
            </label>
          ))}
          <p>
            <button>Set Crust</button>
          </p>
        </form>

        <form method="post" data-test-size>
          <h2>Size</h2>
          <label>
            <select name="size[]">
              {sizes.value.map((size) => (
                <option value={size}>{size}</option>
              ))}
            </select>
          </label>
          <p>
            <button>Set Size</button>
          </p>
        </form>

        <form method="post" data-test-special-instructions>
          <h2>Special Instructions</h2>
          <label>
            <textarea name="special-instructions" />
          </label>
          <p>
            <button>Set Instructions</button>
          </p>
        </form>
      </section>

      <section class="output"></section>
    </div>
  );
});

export const head: DocumentHead = () => {
  return {
    title: 'Actions',
  };
};
