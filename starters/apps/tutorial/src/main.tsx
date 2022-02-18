import { createStore, $, component$, useEvent, Host, onWatch$ } from '@builder.io/qwik';

import './global.css';

interface AppState {
  cart: Cart;
  items: Sku[];
}

type Cart = CartItem[];

interface CartItem {
  sku: Sku;
  qty: number;
  cost: number;
}

interface Sku {
  name: string;
  description: string;
  price: number;
  image: string;
}

export const App = component$(() => {
  const hammer: Sku = {
    name: 'hammer',
    description: 'Bast way to drive nails.',
    price: 19.99,
    image: '',
  };
  const nail: Sku = {
    name: 'nail',
    description: 'Use me to hold wood together.',
    price: 0.05,
    image: '',
  };
  const store = createStore<AppState>({
    cart: [{ sku: hammer, qty: 1, cost: 0 }],
    items: [hammer, nail],
  });
  return $(() => {
    console.log('Render: <Main/>');
    return (
      <Host class="m-6">
        <div>
          <Cart cart={store.cart} />
        </div>
        <div>
          {store.items.map((item) => (
            <Item sku={item} cart={store.cart} />
          ))}
        </div>
      </Host>
    );
  });
});

export const Cart = component$(({ cart }: { cart: Cart }) => {
  const store = createStore({ total: 0 });
  onWatch$((obs) => {
    console.log('Cart:watch', cart);
    store.total = obs(cart).reduce((sum, item) => {
      const { qty } = obs(item);
      return sum + (item.cost = qty * item.sku.price);
    }, 0);
  });
  return $(() => {
    console.log('Render: <Cart/>');
    return (
      <table style={{ float: 'right' }}>
        <tr>
          <th>Qty</th>
          <th>Item</th>
          <th>Cost</th>
          <th>Total</th>
        </tr>
        {cart.map((item) => (
          <tr>
            <td>{item.qty}</td>
            <td>{item.sku.name}</td>
            <td>{item.sku.price.toFixed(2)}</td>
            <td>{item.cost.toFixed(2)}</td>
          </tr>
        ))}
        <tr>
          <td></td>
          <td></td>
          <td></td>
          <td>{store.total.toFixed(2)}</td>
        </tr>
      </table>
    );
  });
});

export const Item = component$(({ sku, cart }: { sku: Sku; cart: CartItem[] }) => {
  return $(() => {
    console.log('Render: <Item/>');
    return (
      <>
        <h1>{sku.name}</h1>
        <Image sku={sku} />
        <Description sku={sku} />
        <button
          on$:click={() => {
            for (const cartItem of cart) {
              if (cartItem.sku === sku) {
                cartItem.qty++;
                return;
              }
            }
            cart.push({ sku, qty: 1, cost: 0 });
          }}
        >
          add to cart
        </button>
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
