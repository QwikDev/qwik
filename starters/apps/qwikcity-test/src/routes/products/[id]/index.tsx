import { Resource, component$, useStore } from '@builder.io/qwik';
import {
  Link,
  useEndpoint,
  useLocation,
  RequestHandler,
  DocumentHead,
} from '@builder.io/qwik-city';
import os from 'node:os';

export default component$(() => {
  const { params, pathname } = useLocation();
  const store = useStore({ productFetchData: '' });

  const resource = useEndpoint<typeof onGet>();

  return (
    <div>
      <h1>Product: {params.id}</h1>

      <Resource
        value={resource}
        onPending={() => <p>Loading</p>}
        onRejected={(e) => <p>{e}</p>}
        onResolved={(product) => {
          if (product == null) {
            return <p>Not Found</p>;
          }

          return (
            <>
              <p>Price: {product.price}</p>
              <p>{product.description}</p>
            </>
          );
        }}
      />

      <p>(Artificial response delay of 200ms)</p>

      <p>
        <button
          onClick$={async () => {
            const rsp = await fetch(pathname, {
              headers: {
                accept: 'application/json',
              },
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
          <Link href="/qwikcity-test/products/jacket/" data-test-link="products-jacket">
            Jacket
          </Link>
        </li>
        <li>
          <Link href="/qwikcity-test/products/hat/">Hat</Link>
        </li>
        <li>
          <Link href="/qwikcity-test/products/shirt/" data-test-link="products-shirt">
            T-Shirt (Redirect to /products/tshirt)
          </Link>
        </li>
        <li>
          <Link href="/qwikcity-test/products/hoodie/" data-test-link="products-hoodie">
            Hoodie (404 Not Found)
          </Link>
        </li>
      </ul>
    </div>
  );
});

export const head: DocumentHead<ProductData | null> = ({ params }) => {
  return {
    title: `Product ${params.id}`,
  };
};

// export const value = process.env.VARIABLE;

export const onGet: RequestHandler<EndpointData> = async ({ params, response }) => {
  // console.warn('process.env.VARIABLE', value);
  // Serverside Endpoint
  // During SSR, this method is called directly on the server and returns the data object
  // On the client, this same data can be requested with fetch() at the same URL, but also
  // requires the "accept: application/json" request header.

  if (params.id === 'shirt') {
    // Redirect, which will skip any rendering and the server will immediately redirect
    throw response.redirect('/qwikcity-test/products/tshirt/');
  }

  const productPrice = PRODUCT_DB[params.id];
  if (!productPrice) {
    // Product data not found, but purposely not throwing a response.error(404)
    // instead the renderer will still run with the returned `null` data
    // and the component will decide how to render it
    response.status = 404;
    // never cache
    response.headers.set('Cache-Control', 'no-cache, no-store, no-fun');
    return null;
  }

  // cache for a super long time of 15 seconds
  response.headers.set('Cache-Control', 'max-age=15');

  return async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    return {
      // Found the product data
      // This same data is passed to the head() function
      // and in the component$() it can be access with useEndpoint()
      productId: params.id,
      price: productPrice,
      description: `Node ${process.versions.node} ${os.platform()} ${os.arch()} ${
        os.cpus()[0].model
      }`,
    };
  };
};

// Our pretty awesome database of prices
const PRODUCT_DB: Record<string, string> = {
  hat: '$21.96',
  jacket: '$48.96',
  tshirt: '$18.96',
};

type EndpointData = ProductData | null;

interface ProductData {
  productId: string;
  price: string;
  description: string;
}
