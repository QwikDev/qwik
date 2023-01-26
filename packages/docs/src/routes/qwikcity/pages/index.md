---
title: Qwik City - Page
contributors:
  - adamdbradley
  - manucorporat
  - Oyemade
  - mhevery
---

# Pages

Both pages and endpoints in Qwik City are created by adding a new `index.tsx` file in the `src/routes` directory.

The only difference is that a page exports a `default` Qwik component, which will be rendered as the content of the page, while an endpoint only exports a `onRequest`, `onGet`, `onPost`, `onPut`, `onDelete`, `onPatch`, `onHead` function, which will be used to handle the incoming request.

```tsx
// src/routes/index.tsx

import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return <h1>Hello World</h1>;
});
```

## `head` export

HTML places the `<head>` tag as the first element within `<html>` (at the very top of the HTML content). The `<head>` section is not something that your route component renders directly, yet you still need to control its content. This can be achieved by exporting a `head` property (or function) from your page component.

```tsx
// src/routes/index.tsx

import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return <h1>Hello World</h1>;
});

export const head = {
  title: 'My Page',
  meta: [
    {
      name: 'description',
      content: 'My page description',
    },
  ],
};
```

> Every endpoint (index) and layout can export a `head` property (or function) that returns a `DocumentHead` object. The `DocumentHead` object is used to resolve the title of the page, as well as the meta, links and styles.

### Dynamic head

In the example above, the `head` is static. However, you can also export a function that returns a `DocumentHead` object. This allows you to dynamically set the title of the page based on the data that is retrieved from `loaders` or request handlers that executed before the page component is rendered.

```tsx
// src/routes/product/[productId]/index.tsx
import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

export const getProductData = loader$(({ params }) => {
  const product = db.getProduct({ id: params.productId });
  return product;
});

export default component$(() => {
  const product = getProductData.use();

  return (
    <div>
      <h1>{product.value.title}</h1>
      <h1>{product.value.description}</h1>
    </div>
  );
});

export const head: DocumentHead = ({ params, getData }) => {
  const product = getData(getProductData);
  return {
    title: `Product "${product.title}"`,
    meta: [
      {
        name: 'description',
        content: product.description,
      },
      {
        name: 'id',
        content: params.productId,
      },
    ],
  };
};
```

The second case is a bit more complicated but it showcases how we can set the title of the page with the value that is retrieved from the `loader$`. (See [data documentation](../../data/overview/index.mdx) for retrieving data.) The Qwik City invokes `onGet` to retrieve the data for the route and then passes the data to the `head` function allowing it to create a custom title.

### Nested layouts and head

An advanced case is that a [layout](../../layout/overview/index.mdx) may want to modify the document title of an already resolved document head. In the example below, the page component returns the title of `Foo`. Next, the containing layout component can read the value of the page's document head and modify it. In this example, the layout component is adding `Bar` to the title, so that when rendered, the title will be `Foo Bar`. Every layout in the stack has the opportunity to return a new value.

```
──src/
  └─routes/
    ├─index.tsx
    └─layout.tsx
```

```tsx
// File: src/routes/index.tsx
export const head: DocumentHead = {
  title: `Foo`,
};
```

```tsx
// File: src/routes/layout.tsx
export const head: DocumentHead<EndpointData> = ({ head }) => {
  return {
    title: `MyCompany - ${head.title}`,
  };
};
```
