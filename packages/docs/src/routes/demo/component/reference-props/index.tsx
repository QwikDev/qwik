import { component$ } from '@builder.io/qwik';

interface ItemProps {
  details: {
    name?: string;
    quantity?: number;
    description?: string;
    price?: number;
  };
}

export const Item = component$((props: ItemProps) => {
  props.details.price = 4.99;

  return (
    <ul>
      <li>name: {props.details.name}</li>
      <li>quantity: {props.details.quantity}</li>
      <li>description: {props.details.description}</li>
      <li>price: {props.details.price}</li>
    </ul>
  );
});

export default component$(() => {
  return (
    <Item
      details={{ name: 'hammer', quantity: 5, description: '', price: 9.99 }}
    />
  );
});
