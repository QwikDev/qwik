import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return (
    <>
      <h1>Props</h1>
      <Item name="hammer" price={9.99} />
    </>
  );
});

interface ItemProps {
  name?: string;
  quantity?: number;
  description?: string;
  price?: number;
}

export const Item = component$<ItemProps>(({ name, quantity, description, price }) => {
  return (
    <ul>
      <li>name: {name}</li>
      <li>quantity: {quantity}</li>
      <li>description: {description}</li>
      <li>price: {price}</li>
    </ul>
  );
});
