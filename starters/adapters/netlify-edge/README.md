## Netlify

This starter site is configured to deploy to [Netlify Edge Functions](https://docs.netlify.com/edge-functions/overview/), which means it will be rendered at an edge location near to your users.

### Local development

The [Netlify CLI](https://docs.netlify.com/cli/get-started/) can be used to preview a production build locally. To do so: First build your site, then to start a local server, run:

1. Install Netlify CLI globally `npm i -g netlify-cli`.
2. Build your site with both ssr and static `npm run build`.
3. Start a local server with `npm run serve`.
   In this project, `npm run serve` uses the `netlify dev` command to spin up a server that can handle Netlify's Edge Functions locally.
4. Visit [http://localhost:8888/](http://localhost:8888/) to check out your site.

### Edge Functions Declarations

[Netlify Edge Functions declarations](https://docs.netlify.com/edge-functions/declarations/)
can be configured to run on specific URL patterns. Each edge function declaration associates
one site path pattern with one function to execute on requests that match the path. A single request can execute a chain of edge functions from a series of declarations. A single edge function can be associated with multiple paths across various declarations.

This is useful to determine if a page response should be Server-Side Rendered (SSR) or
if the response should use a static-site generated (SSG) `index.html` file instead.

By default, the Netlify Edge adaptor will generate a `.netlify/edge-middleware/manifest.json` file, which is used by the Netlify deployment to determine which paths should, and should not, use edge functions.

To override the generated manifest, you can [add a declaration](https://docs.netlify.com/edge-functions/declarations/#add-a-declaration) to the `netlify.toml` using the `[[edge_functions]]` config. For example:

```toml
[[edge_functions]]
  path = "/admin"
  function = "auth"
```

### Addition Adapter Options

Netlify-specific option fields that can be passed to the adapter options:

- `excludedPath` this option accepts a `string` glob pattern that represents which path pattern should not go through the generated Edge Functions.

### Deployments

You can [deploy your site to Netlify](https://docs.netlify.com/site-deploys/create-deploys/) either via a Git provider integration or through the Netlify CLI. This starter site includes a `netlify.toml` file to configure your build for deployment.

#### Deploying via Git

Once your site has been pushed to your Git provider, you can either link it [in the Netlify UI](https://app.netlify.com/start) or use the CLI. To link your site to a Git provider from the Netlify CLI, run the command:

```shell
netlify link
```

This sets up [continuous deployment](https://docs.netlify.com/site-deploys/create-deploys/#deploy-with-git) for your site's repo. Whenever you push new commits to your repo, Netlify starts the build process..

#### Deploying manually via the CLI

If you wish to deploy from the CLI rather than using Git, you can use the command:

```shell
netlify deploy --build
```

You must use the `--build` flag whenever you deploy. This ensures that the Edge Functions that this starter site relies on are generated and available when you deploy your site.

Add `--prod` flag to deploy to production.
