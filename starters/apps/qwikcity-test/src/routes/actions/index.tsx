import { component$, useStyles$ } from '@builder.io/qwik';
import { DocumentHead, serverLoader$ } from '@builder.io/qwik-city';
import styles from './actions.css';

export const toppingsLoader = serverLoader$(() => {
  return ['Pepperoni', 'Sausage', 'Bacon'];
});

export const crustLoader = serverLoader$(() => {
  return ['Thin', 'Deep Dish'];
});

export const sizeLoader = serverLoader$(() => {
  return ['Small', 'Medium', 'Large'];
});

export default component$(() => {
  useStyles$(styles);

  const toppings = toppingsLoader.use();
  const crusts = crustLoader.use();
  const sizes = sizeLoader.use();

  return (
    <div class="actions">
      <section class="input">
        <h1>Qwik Pizza</h1>

        <form method="post" data-test-toppings>
          <h2>Toppings</h2>
          {toppings.value.map((topping) => (
            <label>
              <input type="checkbox" name="toppings" value={topping} />
              <span>{topping}</span>
            </label>
          ))}
          <p>
            <button>Set Toppings</button>
          </p>
        </form>

        <form method="post" data-test-crust>
          <h2>Crust</h2>
          {crusts.value.map((crust) => (
            <label>
              <input type="radio" name="crust" value={crust} />
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
            <select name="size">
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
