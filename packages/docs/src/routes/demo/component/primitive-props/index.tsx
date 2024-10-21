import { component$, useSignal } from '@qwik.dev/core';
import type { Signal } from '@qwik.dev/core';

interface ItemProps {
  name?: string;
  quantity?: number;
  description?: string;
  price?: Signal<number>;
}

export const Item = component$<ItemProps>((props) => {
  const localQuantity = useSignal(props.quantity);

  return (
    <ul>
      <li>name: {props.name}</li>
      <li>quantity: {localQuantity}</li>
      <li>description: {props.description}</li>
      <li>price: {props.price}</li>
    </ul>
  );
});

export default component$(() => {
  const price = useSignal(9.99);

  return (
    <>
      <h1>Props</h1>
      <Item name="hammer" price={price} quantity={5} />
    </>
  );
});
