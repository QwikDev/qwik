import { component$, useStore } from "@builder.io/qwik";
import {
  Link,
  useLocation,
  type DocumentHead,
  routeLoader$,
} from "@builder.io/qwik-city";
import os from "node:os";

export default component$(() => {
  const { params, url } = useLocation();
  const store = useStore({ productFetchData: "" });

  const product = useProductLoader();

  return (
    <div>
      <h1>Product: {params.id}</h1>

      {product.value == null && <p>Not Found</p>}
      {product.value != null && (
        <>
          <p>Price: {product.value.price}</p>
          <p>{product.value.description}</p>
        </>
      )}

      <p>(Artificial response delay of 200ms)</p>

      <p>
        <button
          onClick$={async () => {
            const rsp = await fetch(url.pathname, {
              headers: {
                accept: "application/json",
              },
            });
            store.productFetchData = JSON.stringify(await rsp.json(), null, 2);
          }}
        >
          fetch("{url.pathname}") data
        </button>
      </p>

      <pre>
        <code>{store.productFetchData}</code>
      </pre>

      <hr />

      <ul>
        <li>
          <Link
            href="/qwikcity-test/products/jacket/"
            data-test-link="products-jacket"
          >
            Jacket
          </Link>
        </li>
        <li>
          <Link href="/qwikcity-test/products/hat/">Hat</Link>
        </li>
        <li>
          <Link
            href="/qwikcity-test/products/shirt/"
            data-test-link="products-shirt"
          >
            T-Shirt (Redirect to /products/tshirt)
          </Link>
        </li>
        <li>
          <Link
            href="/qwikcity-test/products/hoodie/"
            data-test-link="products-hoodie"
          >
            Hoodie (404 Not Found)
          </Link>
        </li>
        <li>
          <a
            href="/qwikcity-test/products/hat/?json=true"
            data-test-link="products-hat-json"
          >
            Hat (200 json)
          </a>
        </li>

        <li>
          <a
            href="/qwikcity-test/products/error"
            data-test-link="products-error"
          >
            Error
          </a>
        </li>
      </ul>
    </div>
  );
});

export const head: DocumentHead = ({ params }) => {
  return {
    title: `Product ${params.id}`,
  };
};

// Our pretty awesome database of prices
export const PRODUCT_DB: Record<string, string> = {
  hat: "$21.96",
  jacket: "$48.96",
  tshirt: "$18.96",
};

export const useProductLoader = routeLoader$(
  async ({ headers, json, error, params, query, redirect, status }) => {
    // Serverside Endpoint
    // During SSR, this method is called directly on the server and returns the data object
    // On the client, this same data can be requested with fetch() at the same URL, but also
    // requires the "accept: application/json" request header.

    const id = params.id;
    if (query.has("querystring-test")) {
      throw redirect(301, "/qwikcity-test/");
    }

    if (id === "shirt") {
      // Redirect, which will skip any rendering and the server will immediately redirect
      throw redirect(301, "/qwikcity-test/products/tshirt/");
    }

    if (id === "error") {
      throw error(500, "Error from server");
    }

    const productPrice = PRODUCT_DB[id];
    if (!productPrice) {
      // Product data not found, but purposely not throwing a response.error(404)
      // instead the renderer will still run with the returned `null` data
      // and the component will decide how to render it
      status(404);
      // never cache
      headers.set("Cache-Control", "no-cache, no-store, no-fun");
      return null;
    }

    // cache for a super long time of 15 seconds
    headers.set("Cache-Control", "max-age=15");

    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    const data = {
      // Found the product data
      // This same data is passed to the head() function
      // and in the component$() it can be access with useEndpoint()
      productId: id,
      price: productPrice,
      description: `Node ${
        process.versions.node
      } ${os.platform()} ${os.arch()} ${os.cpus()[0].model}`,
    };
    if (query.get("json") === "true") {
      json(200, data);
    }
    return data;
  },
);
