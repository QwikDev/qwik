import { Resource, component$, Host } from '@builder.io/qwik';
import { useEndpoint, useLocation, EndpointHandler, DocumentHead } from '@builder.io/qwik-city';
import os from 'os';

export default component$(() => {
  const { params } = useLocation();

  const resource = useEndpoint<typeof onGet>();

  return (
    <Host>
      <Resource
        resource={resource}
        onPending={() => <p>Loading</p>}
        onResolved={(product) => {
          if (product == null) {
            return <h1>Product "{params.id}" not found</h1>;
          }

          return (
            <>
              <h1>Product: {product.productId}</h1>
              <p>Price: {product.price}</p>
              <p>{product.description}</p>
            </>
          );
        }}
      />

      <p>(Artificial response delay of 250ms)</p>

      <hr />

      <ul>
        <li>
          <a href="/products/jacket">Jacket</a>
        </li>
        <li>
          <a href="/products/hat">Hat</a>
        </li>
        <li>
          <a href="/products/shirt">T-Shirt (Redirect to /products/tshirt)</a>
        </li>
        <li>
          <a href="/products/hoodie">Hoodie (404 Not Found)</a>
        </li>
      </ul>
    </Host>
  );
});

export const head: DocumentHead<ProductData> = ({ data }) => {
  return {
    title: `Product ${data.productId}, ${data.price}`,
  };
};

export const onGet: EndpointHandler<EndpointData> = async ({ params, response }) => {
  // Serverside Endpoint
  // During SSR, this method is called directly on the server and returns the data object
  // On the client, this same data can be requested with fetch() at the same URL, but also
  // requires the "accept: application/json" request header.

  if (params.id === 'shirt') {
    // Redirect, which will skip any rendering and the server will immediately redirect
    response.redirect('/products/tshirt');
    return;
  }

  // artificially slow database call
  const productData = await loadProduct(params.id);

  if (!productData) {
    // Product data not found
    // but the data is still given to the renderer to decide what to do
    response.status = 404;
    return;
  }

  // Found the product data
  // This same data is passed to the head() function
  // and in the component$() it can be access with useEndpoint()
  response.headers.set('Cache-Control', 'no-cache, no-store, no-fun');
  return productData;
};

// our pretty awesome function to load product data
const loadProduct = (productId: string) => {
  return new Promise<ProductData | null>((resolve) =>
    setTimeout(() => {
      const productPrice = PRODUCT_DB[productId];
      if (!productPrice) {
        return null;
      }

      const productData: ProductData = {
        productId,
        price: productPrice,
        description: `Node ${process.versions.node} ${os.platform()} ${os.arch()} ${
          os.cpus()[0].model
        }`,
      };

      resolve(productData);
    }, 250)
  );
};

// Our pretty awesome database of prices
const PRODUCT_DB: Record<string, string> = {
  hat: '$21.96',
  jacket: '$48.96',
  tshirt: '$18.96',
};

type EndpointData = ProductData;

interface ProductData {
  productId: string;
  price: string;
  description: string;
}
