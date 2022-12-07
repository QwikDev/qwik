import { component$, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import styles from './actions.css';

export default component$(() => {
  useStyles$(styles);

  return (
    <div class="actions">
      <section class="input">
        <h1>Actions</h1>

        <form method="post" data-test-toppings>
          <h2>Toppings</h2>
          <label>
            <input type="checkbox" name="toppings" value="Pepperoni" />
            <span>Pepperoni</span>
          </label>
          <label>
            <input type="checkbox" name="toppings" value="Sausage" />
            <span>Sausage</span>
          </label>
          <label>
            <input type="checkbox" name="toppings" value="Mushrooms" />
            <span>Mushrooms</span>
          </label>
          <label>
            <input type="checkbox" name="toppings" value="Bacon" />
            <span>Bacon</span>
          </label>
          <p>
            <button>Set Toppings</button>
          </p>
        </form>

        <form method="post" data-test-crust>
          <h2>Crust</h2>
          <label>
            <input type="radio" name="crust" value="Pan" />
            <span>Thin</span>
          </label>
          <label>
            <input type="radio" name="crust" value="Mushrooms" />
            <span>Deep Dish</span>
          </label>
          <p>
            <button>Set Crust</button>
          </p>
        </form>

        <form method="post" data-test-size>
          <h2>Size</h2>
          <label>
            <select name="size">
              <option value="Small">Small</option>
              <option value="Medium">Medium</option>
              <option value="Large">Large</option>
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
