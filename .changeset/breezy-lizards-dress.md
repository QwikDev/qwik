---
'@builder.io/qwik-city': patch
---

FIX: MDX content now accepts a prop of type `components` that lets you use your own custom components

To add custom components to your MDX content, you can now do this:

```tsx
// routes/example/index.tsx
import Content from './markdown.mdx';
import MyComponent from '../../components/my-component/my-component';
import { component$ } from '@builder.io/qwik';

export default component$(() => <Content components={{ MyComponent }} />);
```

You can also use props in JS expressions. See https://mdxjs.com/docs/using-mdx/#props
