## Cloudflare Workers

Cloudflare's [wrangler](https://github.com/cloudflare/wrangler) CLI can be used to preview a production build locally. To start a local server, run:

```
npm run serve
```

Then visit [http://localhost:8787/](http://localhost:8787/)

### Deployments

[Cloudflare Workers](https://workers.cloudflare.com/) can be deployed using the [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/).

If you don't already have an account, then [create a Cloudflare account here](https://dash.cloudflare.com/sign-up/workers-and-pages).

Once authenticated, you can deploy your Worker:

```
npm run deploy
```

### Configuration

The `wrangler.jsonc` file contains your Worker configuration. Key settings include:

- **name**: Your Worker's name
- **main**: Path to your Worker script (default: `./dist/_worker.js`)
- **compatibility_date**: The date used for compatibility with the Workers runtime
- **assets**: Configuration for serving static assets
- **bindings**: Resources your Worker can interact with (KV, R2, D1, etc.)

After adding any binding, use this command to regenerate the worker-configuration.d.ts file
```
npm run cf-typegen
```

For more details, see the [Wrangler configuration documentation](https://developers.cloudflare.com/workers/wrangler/configuration/).

### Bindings

Cloudflare Workers can interact with various Cloudflare resources through bindings:

- **KV**: Key-value storage
- **R2**: Object storage
- **D1**: SQL database
- **Durable Objects**: Strongly consistent storage
- **Queues**: Message queues
- **AI**: AI inference

Configure bindings in your `wrangler.jsonc` file. See the [bindings documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/) for more information.
