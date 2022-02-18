import {
  createStore,
  $,
  component$,
  useEvent,
  Host,
  onWatch$,
  useHostElement,
  useStyles$,
  Slot,
} from '@builder.io/qwik';

import globalCss from './global.css';

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
    image: './hammer.jpg',
  };
  const nail: Sku = {
    name: 'nails',
    description: 'Use me to hold wood together.',
    price: 0.05,
    image: './nails.jpg',
  };
  const store = createStore<AppState>({
    cart: [{ sku: hammer, qty: 1, cost: 0 }],
    items: [hammer, nail],
  });
  useStyles$(globalCss);
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
    markRender('<Cart/>');
    return (
      <Host class="float-right">
        <table>
          <tr>
            <th></th>
            <th>Qty</th>
            <th>Item</th>
            <th>Cost</th>
            <th>Total</th>
          </tr>
          {cart.map((item) => (
            <tr>
              <td>
                {item.sku.image ? <img class="max-h-5 max-w-5 pr-5" src={item.sku.image} /> : null}
              </td>
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
            <td></td>
            <td>{store.total.toFixed(2)}</td>
          </tr>
        </table>
      </Host>
    );
  });
});

export const Item = component$(({ sku, cart }: { sku: Sku; cart: CartItem[] }) => {
  return $(() => {
    markRender('<Item/>');
    return (
      <>
        <h1>{sku.name}</h1>
        <Image sku={sku} />
        <Toggle>{sku.description}</Toggle>
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

export const Toggle = component$(() => {
  const store = createStore({ isOpen: false });
  return $(() => {
    markRender('<Description/>');
    return (
      <div>
        <span on$:click={() => (store.isOpen = !store.isOpen)}>{store.isOpen ? '[-]' : '[+]'}</span>
        {store.isOpen ? <Slot /> : null}
      </div>
    );
  });
});

export const Image = component$(({ sku }: { sku: Sku }) => {
  return $(() => {
    markRender('<Image/>');
    return <img class="max-h-100 max-w-100" src={sku.image} />;
  });
});

export const Description = component$(({ sku }: { sku: Sku }) => {
  return $(() => {
    markRender('<Description/>');
    return <div>{sku.description}</div>;
  });
});

export function markRender(componentName: string) {
  console.log('RENDER', componentName);
  const isClient = typeof document == 'object';
  if (isClient) {
    const host = useHostElement();
    setTimeout(() => {
      host.classList.add('rendered');
      setTimeout(() => {
        host.classList.remove('rendered');
      }, 500);
    }, 10);
  }
}
