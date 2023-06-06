## Builder.io + Qwik

An example of using [Builder.io's](https://www.builder.io) drag-and-drop headless CMS with Qwik.

See [src/routes[...index]/index.tsx](src/routes[...index]/index.tsx) for the integration code.

### How to use

Create a free [Builder.io account](https://builder.io/signup) (only takes a couple minutes), and paste your [public API key](https://www.builder.io/c/docs/using-your-api-key) into `.env`

```diff
- BUILDER_PUBLIC_API_KEY=YOUR_API_KEY
+ BUILDER_PUBLIC_API_KEY=abc123
```

Then run the development server:

```bash
npm run dev
```

Now, go set your [preview URL](https://www.builder.io/c/docs/guides/preview-url) to `http://localhost:5173/`

1. Go to [https://builder.io/models](builder.io/models)
2. Choose the `page` model
3. Set the preview URL to `http://localhost:5173/` and click `save` in the top right

Now, let's create a page in Builder.io and see it live in Qwik!

1. Go to [https://builder.io/content](builder.io/content)
2. Click `+ New` and choose `Page`
3. Give it a name and click `Create`

Now, try out the visual editor! You can find a custom Qwik components
in the `Custom Components` section of the insert tab.

You may also limit visual editing to only your custom components with [components-only mode](https://www.builder.io/c/docs/guides/components-only-mode).

### Next Steps

See our full integration guides [here](https://www.builder.io/c/docs/developers)

Also, when you push your integration to production, go back and update your preview URL to your production URL so now anyone on your team can visuall create content in your Qwik app!

Also, to integrate structured data, see [this guide](https://www.builder.io/c/docs/integrate-cms-data)
