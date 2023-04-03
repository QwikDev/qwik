import { component$ } from '@builder.io/qwik';

interface ItemProps {
  name?: string;
  quantity?: number;
  description?: string;
  price?: number;
}

export const Item = component$<ItemProps>((props) => {
  return (
    <ul>
      <li>name: {props.name}</li>
      <li>quantity: {props.quantity}</li>
      <li>description: {props.description}</li>
      <li>price: {props.price}</li>
    </ul>
  );
});

export default component$(() => {
  return (
    <>
      <h1>Props</h1>
      <Item name="hammer" price={9.99} />
    </>
  );
});
