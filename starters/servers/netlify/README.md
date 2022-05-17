## Netlify

This site is configured to deploy to [Netlify Edge Functions](https://www.netlify.com/products/edge/), which means it will be rendered at an edge location near to your users.

The [Netlify CLI](https://docs.netlify.com/cli/get-started/) can be used to preview a production build locally. First build your site, then to start a local server, run:

```shell
npm run serve
```

Then visit [http://localhost:8888/](http://localhost:8888/) to see the site.

### Deployments

You can [deploy your site to Netlify](https://docs.netlify.com/site-deploys/create-deploys/) either via a Git provider integration or through the Netlify CLI. This site already includes a `netlify.toml` file to configure your build.

#### Deploying via Git

Once your site has been pushed to your Git provider, you can either link it [in the Netlify UI](https://app.netlify.com/start) or use the CLI. To link the site to a Git provider from the Netlify CLI, run the command:

```shell
netlify link
```

It will then deploy the site whenever you push new commits to Git.

#### Deploying manually via the CLI

If you wish to deploy from the CLI rather than using Git, you can use the command:

```shell
netlify deploy --build
```

You must ensure you use the `--build` flag whenever you deploy.
