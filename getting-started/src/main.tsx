import { createStore, $, component$, useEvent, Host, onWatch$ } from '@builder.io/qwik';

import './global.css';

interface AppState {
  cart: CartItem[];
  items: Sku[];
}

interface CartItem {
  sku: Sku;
  qty: number;
  const: number;
}

interface Sku {
  name: string;
  description: string;
  price: number;
  image: string;
}

export const App = component$(() => {
  const state = createStore<AppState>({
    cart: [],
    items: [],
  });
  return $(() => (
    <Host class="m-6">
      <div>
        <Cart cartItems={state.cart} />
      </div>
      <div>
        {state.items.map((item) => (
          <Item sku={item} />
        ))}
      </div>
    </Host>
  ));
});

export const Cart = component$(({ cartItems }: { cartItems: CartItem[] }) => {
  const store = createStore({ total: 0 });
  onWatch$((obs) => {
    store.total = obs(cartItems).reduce((sum, item) => sum + obs(item).qty * item.sku.price, 0);
  });
  return $(() => <>{store.total}</>);
});

export const Item = component$(({ sku }: { sku: Sku }) => {
  return $(() => {
    console.log('Render: <Item/>');
    return (
      <>
        <h1>{sku.name}</h1>
        <div>{sku.description}</div>
        <Image sku={sku} />
        <Description sku={sku} />
      </>
    );
  });
});

export const Image = component$(({ sku }: { sku: Sku }) => {
  return $(() => {
    console.log('Render: <Image/>');
    return <img src={sku.image} />;
  });
});

export const Description = component$(({ sku }: { sku: Sku }) => {
  return $(() => {
    console.log('Render: <Description/>');
    return <div>{sku.description}</div>;
  });
});
