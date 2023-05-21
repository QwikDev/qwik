import type { Logger, Plugin } from 'vite';
import fs from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { request } from 'node:https';

function html(content: string) {
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>Visual CMS Site Integration With Builder.io</title>
      <style>
        html {
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
            'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji',
            'Segoe UI Symbol', 'Noto Color Emoji';
        }
        body {
          padding: 80px 0;
          line-height: 1.8;
        }
        main {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 40px;
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
        }
        h1 {
          margin-top: 0;
        }
        button {
          cursor: pointer;
        }
        aside ul {
          margin: 0;
          padding: 0;
          list-style: none;
        }
        aside li {
          margin: 0;
          padding: 20px 10px;
        }
        aside li a {
          text-decoration: none;
          color: inherit;
        }
        aside li.active {
          font-weight: bold;
        }
        aside li.completed {
          color: gray;
        }
      </style>
      <link rel="icon shortcut" href="https://cdn.builder.io/favicon.ico">
    </head>
    <body>
      <main>${content}</main>
    </body>
  </html>
  `;
}

/**
 * First step in the setup process. Show all the steps and explain what's going on.
 */
function setupOverviewStep(ctx: BuilderSetupContext) {
  const nextStepUrl = getAuthConnectUrl(ctx);

  return html(`
    <aside>
      <ul>
        <li class="active">
          Overview
        </li>
        <li>
          <a href="${nextStepUrl}">
            Connect Builder.io
          </a>
        </li>
        <li>
          Setup content page
        </li>
      </ul>
    </aside>
    <section>
      <h1>
        Integrate Builder.io Visual CMS with ${ctx.framework}
      </h1>
      <p>
        Success! Your ${ctx.framework} app has been created!
      </p>
      <p>
        Next let's connect Builder.io so you can start editing and publishing content.
      </p>
      <nav>
        <p>
          <a href="${nextStepUrl}">Next</a>
        </p>
      </nav>
    </section>
  `);
}

function getDefaultHomepage(publicApiKey: string, urlPath: string) {
  return {
    '@version': 4,
    name: DEFAULT_HOMEPAGE_PAGE_NAME,
    ownerId: publicApiKey,
    published: 'published',
    query: [
      {
        '@type': '@builder.io/core:Query',
        property: 'urlPath',
        value: urlPath,
        operator: 'is',
      },
    ],
    data: {
      blocksString: DEFAULT_HOMEPAGE_BLOCK,
      title: DEFAULT_HOMEPAGE_PAGE_NAME,
      url: urlPath,
    },
  };
}

const DEFAULT_HOMEPAGE_PAGE_NAME = `Homepage`;
const DEFAULT_HOMEPAGE_BLOCK = `[{"@type":"@builder.io/sdk:Element","@version":2,"id":"builder-b3e7bacb8fc740109a8154507ad3f39b","component":{"name":"Text","options":{"text":"<h1>Hello Qwik!</h1>"}},"responsiveStyles":{"large":{"display":"flex","flexDirection":"column","position":"relative","flexShrink":"0","boxSizing":"border-box","marginTop":"20px","lineHeight":"normal","height":"auto","marginLeft":"auto","marginRight":"auto"}}},{"@type":"@builder.io/sdk:Element","@version":2,"id":"builder-15627179727f4fcba1246a6da5e8ae67","component":{"name":"Image","options":{"image":"https://cdn.builder.io/api/v1/image/assets%2F4025e37ed968472fac153d65c579ca46%2Fb2a221368b714e8991e94790bb3a0068","backgroundSize":"cover","backgroundPosition":"center","lazy":false,"fitContent":true,"aspectRatio":1.333,"lockAspectRatio":false,"height":1300,"width":975}},"responsiveStyles":{"large":{"display":"flex","flexDirection":"column","position":"relative","flexShrink":"0","boxSizing":"border-box","marginTop":"20px","width":"100%","minHeight":"20px","minWidth":"20px","overflow":"hidden"}}}]`;

async function validateBuilderSetup(
  ctx: BuilderSetupContext,
  url: URL | null | undefined
): Promise<BuilderSetupResult> {
  const result: BuilderSetupResult = {};

  try {
    if (ctx.isValid || !url || !isPageRequest(url)) {
      // all good, already validated
      // or this is not a page request so don't bother
      return result;
    }

    // remember the dev server url we're currently at
    ctx.url = url;

    // get the keys from the querystring (if they exist)
    const qsApiKey = url.searchParams.get(BUILDER_AUTH_API_KEY_QS);
    const qsPrivateKey = url.searchParams.get(BUILDER_AUTH_PRIVATE_KEY_QS);

    // check if we're returning from the builder.io auth flow
    if (qsApiKey && qsPrivateKey) {
      // we've returned from the builder.io auth flow
      // and have the auth keys in the querystirng

      // querystring has the public api key
      // save it to the .env file
      await setBuilderPublicApiKey(ctx, qsApiKey);

      // see if this builder account already has a homepage created
      const hasHomepage = await hasBuilderHomepage(ctx, qsApiKey);
      if (!hasHomepage) {
        // there is no homepage content created yet
        // create the default homepage for them
        await createBuilderHomepage(ctx, qsApiKey, qsPrivateKey);
      }

      // let's redirect to the app base url
      // but without the keys in the querystring
      const nextUrl = getAppBaseUrl(ctx);

      // set the redirect url the server should 302 to next
      result.redirectUrl = nextUrl.href;
      return result;
    }

    // get the builder public api key from the .env file
    const envApiKey = await getValidBuilderApiKey(ctx);
    if (!envApiKey) {
      // we don't have a valid api key saved in the .env file
      // respond with the first step of setup UI
      result.setupHtml = setupOverviewStep(ctx);
      return result;
    }

    // it's possible that .env is setup, but they still don't have a homepage somehow
    // double check if this builder account already has a homepage created
    const hasHomepage = await hasBuilderHomepage(ctx, envApiKey);
    if (!hasHomepage) {
      // there is no homepage content created yet for the valid public api key
      // we don't have their private key, so let's redirect to the auth flow
      // so we can get their private key and create the homepage for them
      // respond with the first step of setup UI
      result.setupHtml = setupOverviewStep(ctx);
      return result;
    }

    // awesome, we're all set
    // the public key is saved correctly in the .env file
    // and they have a homepage created
    // no need to respond with the setup UI
    // set isValid to true so we don't have to validate again
    ctx.isValid = true;
  } catch (e: any) {
    // collect the error and let the build decide how to handle it
    result.errors = [e.message];
  }

  return result;
}

async function hasBuilderHomepage(ctx: BuilderSetupContext, apiKey: string) {
  try {
    const url = new URL(`https://cdn.builder.io/api/v3/content/page`);
    url.searchParams.set(`apiKey`, apiKey);
    url.searchParams.set(`url`, ctx.appBasePathname);
    url.searchParams.set(`cachebust`, Math.random().toString());

    const res = await requestJSON<{ results: any[] }>({
      url,
      method: 'GET',
    });

    return res.results.length > 0;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function createBuilderHomepage(
  ctx: BuilderSetupContext,
  publicApiKey: string,
  privateKey: string
) {
  const url = new URL(`https://cdn.builder.io/api/v1/write/page`);

  const homepage = getDefaultHomepage(publicApiKey, ctx.appBasePathname);
  homepage.query[0].value = ctx.appBasePathname;
  homepage.data.url = ctx.appBasePathname;

  await requestJSON({
    url,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${privateKey}`,
    },
    body: JSON.stringify(homepage),
  });
}

function requestJSON<T>(opts: RequestOptions) {
  return new Promise<T>((resolve, reject) => {
    const req = request(
      {
        protocol: opts.url.protocol,
        host: opts.url.host,
        port: opts.url.port,
        path: opts.url.pathname + opts.url.search,
        method: opts.method,
        headers: opts.headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (!res.statusCode || res.statusCode > 299) {
            reject(`Request to ${res.url} failed with status ${res.statusCode}`);
          } else {
            if (
              typeof res.headers['content-type'] !== 'string' ||
              !res.headers['content-type'].includes('application/json')
            ) {
              reject(`Response from ${res.url} content-type is ${res.headers['content-type']}`);
            } else {
              try {
                resolve(JSON.parse(data));
              } catch (err) {
                reject(`Response from ${res.url} is not valid JSON: ${data}\n${err}`);
              }
            }
          }
        });
      }
    ).on('error', reject);

    if (opts.body) {
      req.setHeader('Content-Type', 'application/json');
      req.write(opts.body);
    }

    req.end();
  });
}

interface RequestOptions {
  url: URL;
  headers?: Record<string, string>;
  method?: string;
  body?: any;
}

async function setBuilderPublicApiKey(ctx: BuilderSetupContext, publicApiKey: string) {
  const comment = `# https://www.builder.io/c/docs/using-your-api-key`;

  // check if we already have an .env file
  if (fs.existsSync(ctx.envFilePath)) {
    // read the existing .env file
    let envContent = await fs.promises.readFile(ctx.envFilePath, 'utf-8');
    if (envContent.includes(BUILDER_API_KEY_ENV)) {
      // existing .env has a builder api key already, update its value
      envContent = envContent.replace(
        new RegExp(`${BUILDER_API_KEY_ENV}=.*`),
        `${BUILDER_API_KEY_ENV}=${publicApiKey}`
      );
    } else {
      // existing .env does not have a builder api key, append the key/value
      envContent += `\n\n${comment}\n${BUILDER_API_KEY_ENV}=${publicApiKey}\n\n`;
    }

    // update the .env file
    await fs.promises.writeFile(ctx.envFilePath, envContent);
  } else {
    // create a new .env file since it doesn't exist yet
    const newEnv = [comment, `${BUILDER_API_KEY_ENV}=${publicApiKey}`, ``];
    await fs.promises.writeFile(ctx.envFilePath, newEnv.join('\n'));
  }
}

async function getValidBuilderApiKey(ctx: BuilderSetupContext): Promise<string | null> {
  if (fs.existsSync(ctx.envFilePath)) {
    const envContent = await fs.promises.readFile(ctx.envFilePath, 'utf-8');

    const envs = envContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .filter((l) => !l.startsWith('#'))
      .filter((l) => l.includes('='))
      .map((l) => {
        const [key, value] = l.split('=');
        return { key, value };
      });

    const builderApiKey = envs.find((e) => e.key === BUILDER_API_KEY_ENV);
    if (typeof builderApiKey?.value === 'string' && builderApiKey.value.length > 0) {
      if (builderApiKey.value !== 'YOUR_API_KEY') {
        return builderApiKey.value;
      }
    }
  }
  return null;
}

function isPageRequest(url: URL) {
  if (url.pathname.endsWith('/')) {
    return true;
  }

  const filename = url.pathname.split('/').pop();
  if (filename) {
    if (!filename.includes('.')) {
      return true;
    }

    const ext = filename.split('.').pop();
    if (ext === 'html') {
      return true;
    }
  }
  return false;
}

function createBuilderSetup(opts: CreateSetupOptions) {
  const ctx: BuilderSetupContext = {
    ...opts,
    isValid: false,
    url: null,
  };

  const builder: BuilderSetup = {
    validate: (url) => validateBuilderSetup(ctx, url),
    getEnvFilePath: () => ctx.envFilePath,
  };
  return builder;
}

/**
 * Get the auth url to connect to builder, and the url to redirect to after connecting
 */
function getAuthConnectUrl(ctx: BuilderSetupContext) {
  const authUrl = new URL(`/cli-auth`, `https://builder.io`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('cli', 'true');
  authUrl.searchParams.set('client_id', ctx.clientId);
  authUrl.searchParams.set('host', ctx.clientHostname);

  const returnUrl = getAppBaseUrl(ctx).href;
  authUrl.searchParams.set('redirect_url', returnUrl);

  return authUrl.href;
}

function getAppBaseUrl(ctx: BuilderSetupContext) {
  return new URL(ctx.appBasePathname, ctx.url!.origin);
}

interface CreateSetupOptions {
  appBasePathname: string;
  clientId: string;
  clientHostname: string;
  envFilePath: string;
  framework: string;
}

interface BuilderSetupContext extends CreateSetupOptions {
  isValid: boolean;
  url: URL | null;
}

interface BuilderSetup {
  validate: (url: URL | null | undefined) => Promise<BuilderSetupResult>;
  getEnvFilePath: () => string;
}

interface BuilderSetupResult {
  setupHtml?: string;
  redirectUrl?: string;
  errors?: string[];
}

const BUILDER_API_KEY_ENV = `PUBLIC_BUILDER_API_KEY`;
const BUILDER_AUTH_API_KEY_QS = `api-key`;
const BUILDER_AUTH_PRIVATE_KEY_QS = `p-key`;

/**
 * Vite plugin that adds builder.io setup UI
 */
export function builderio(opts: BuilderioOptions = {}): Plugin {
  let builder: BuilderSetup | null;
  let logger: Logger | null;

  return {
    name: 'builderioDevTools',

    configResolved(config) {
      logger = config.logger;
      builder = createBuilderSetup({
        appBasePathname: config.base,
        envFilePath: opts.envFilePath || join(config.root, '.env'),
        framework: 'Qwik',
        clientId: 'create-qwik-app',
        clientHostname: hostname(),
      });
    },

    configureServer(server) {
      if (builder) {
        // do not watch the .env file since we don't want to restart the server on changes
        server.watcher.unwatch(builder.getEnvFilePath());
      }

      server.middlewares.use(async (req, res, next) => {
        // add Vite dev server middleware that
        // shows builder setup UI if needed
        if (builder && server.httpServer && req.url) {
          const address = server.httpServer.address();
          let url: URL | null = null;
          if (typeof address === 'string') {
            url = new URL(req.url!, address);
          } else if (address) {
            url = new URL(req.url!, `http://${address.address}:${address.port}`);
          }

          const result = await builder.validate(url);

          if (result.errors && logger) {
            result.errors.map((e) => logger!.error(e));
          }

          if (result.redirectUrl) {
            res.writeHead(302, {
              Location: result.redirectUrl,
            });
            res.end();
            return;
          }

          if (result.setupHtml) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'max-age=0, no-cache, no-store');
            res.setHeader('X-Builderio-Vite-Dev-Server', 'true');
            res.end(result.setupHtml);
            return;
          }
        }
        next();
      });
    },
  };
}

export interface BuilderioOptions {
  /**
   * Absolute path to the project's `.env` file.
   */
  envFilePath?: string;
}
