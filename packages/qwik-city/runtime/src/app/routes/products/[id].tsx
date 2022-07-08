import { component$, Host, useStore } from '@builder.io/qwik';
import { useEndpoint, useLocation, useResponse, EndpointHandler } from '~qwik-city-runtime';
import os from 'os';

export default component$(() => {
  const { params, pathname } = useLocation();
  const response = useResponse();
  const store = useStore({ productFetchData: '' });

  if (params.id === 'shirt') {
    response.redirect = '/products/t-shirt';
    return null;
  }

  const product = useEndpoint<ProductData | null>();

  if (product.state === 'resolved' && product.resolved == null) {
    response.status = 404;
    return <h1>Product "{params.id}" not found</h1>;
  }

  response.cacheControl = 'no-cache, no-store, no-fun';

  return (
    <Host>
      <h1>Product: {product.resolved?.productId}</h1>
      <p>Price: {product.resolved?.price}</p>
      <p>{product.resolved?.description}</p>

      <p>
        <button
          onClick$={async () => {
            const rsp = await fetch(pathname, {
              headers: { accept: 'application/json' },
            });
            store.productFetchData = JSON.stringify(await rsp.json(), null, 2);
          }}
        >
          fetch("{pathname}") data
        </button>
      </p>
      <pre>
        <code>{store.productFetchData}</code>
      </pre>

      <hr />

      <ul>
        <li>
          <a href="/products/shirt">T-Shirt (308 redirect to /products/t-shirt)</a>
        </li>
        <li>
          <a href="/products/hoodie">Hoodie (404 Not Found)</a>
        </li>
        <li>
          <a href="/products/hat">Hat</a>
        </li>
      </ul>
    </Host>
  );
});

export const onGet: EndpointHandler<ProductData | null> = async ({ params }) => {
  await new Promise<void>((resolve) => setTimeout(resolve, 10));

  const db: Record<string, string> = {
    hat: '$12.96',
    't-shirt': '$18.96',
  };

  const price = db[params.id];

  if (!price) {
    return {
      status: 404,
      body: null,
    };
  }

  return {
    body: {
      productId: params.id,
      price: price,
      description: `Node ${process.versions.node} ${os.platform()} ${os.arch()} ${
        os.cpus()[0].model
      }`,
    },
  };
};

interface ProductData {
  productId: string;
  price: string;
  description: string;
}
