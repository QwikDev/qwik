import type { Logger, Plugin } from 'vite';
import fs from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';

function getSetupHtml(ctx: BuilderSetupContext, step: SetupStep) {
  const stepHtml =
    step === STEP_COMPLETED
      ? completedStep(ctx)
      : step === STEP_PREVIEW
      ? previewUrlStep(ctx)
      : step === STEP_AUTH_SUCCESS
      ? authSuccessStep(ctx)
      : step === STEP_OVERVIEW
      ? setupOverviewStep(ctx)
      : null;

  if (!stepHtml) {
    return null;
  }

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <title>Visual CMS Site Integrating With Builder.io</title>
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
      <main>${stepHtml}</main>
    </body>
  </html>
  `;
}

/**
 * First step in the setup process. Show all the steps and explain what's going on.
 */
function setupOverviewStep(ctx: BuilderSetupContext) {
  const nextStepUrl = getAuthConnectUrl(ctx);

  return `
    <aside>
      <ul>
        <li class="active">
          Overview
        </li>
        <li>
          <a href="${nextStepUrl}">
            Connect to Builder.io
          </a>
        </li>
        <li>
          Publish
        </li>
        <li>
          Finish
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
        Let's connect it to Builder.io so you can start editing and publishing updates.
      </p>
      <nav>
        <p>
          <a href="${nextStepUrl}">Next</a>
        </p>
      </nav>
    </section>
  `;
}

/**
 * User has successfully connected to Builder.io and returned from its auth flow.
 */
function authSuccessStep(ctx: BuilderSetupContext) {
  const nextStepUrl = getStepUrl(ctx, 'preview');

  return `
    <aside>
      <ul>
        <li class="completed">
          Overview
        </li>
        <li class="active">
          Connect to Builder.io
        </li>
        <li>
          <a href="${nextStepUrl}">
            Preview
          </a>
        </li>
        <li>
          Finish
        </li>
      </ul>
    </aside>
    <section>
      <h1>
        Successfully connected to Builder.io
      </h1>
      <p>
        Great! You've connected this ${ctx.framework} app to your Builder.io account.
      </p>
      <p>
        Next let's setup the preview url.
      </p>
      <nav>
        <p>
          <a href="${nextStepUrl}">Next</a>
        </p>
      </nav>
    </section>
  `;
}

/**
 * Setup the Builder.io preview url.
 */
function previewUrlStep(ctx: BuilderSetupContext) {
  const nextStepUrl = getStepUrl(ctx, 'completed');

  return `
    <aside>
      <ul>
        <li class="completed">
          Overview
        </li>
        <li class="completed">
          Connect to Builder.io
        </li>
        <li class="active">
          Preview
        </li>
        <li>
          <a href="${nextStepUrl}">
            Finish
          </a>
        </li>
      </ul>
    </aside>
    <section>
      <h1>
        Setup your preview url
      </h1>
      <p>
        Next we need to set the preview url.
      </p>
      <nav>
        <p>
          <a href="${nextStepUrl}">Next</a>
        </p>
      </nav>
    </section>
  `;
}

/**
 * All set! Great job, we did it!
 */
function completedStep(ctx: BuilderSetupContext) {
  const nextStepUrl = getStepUrl(ctx, null);

  return `
    <aside>
      <ul>
        <li class="completed">
          Overview
        </li>
        <li class="completed">
          Connect to Builder.io
        </li>
        <li class="completed">
          Preview
        </li>
        <li class="active">
          <a href="${nextStepUrl}">
            Finish
          </a>
        </li>
      </ul>
    </aside>
    <section>
      <h1>
        You're all set!
      </h1>
      <p>
        You can now start editing your ${ctx.framework} app!
      </p>
      <nav>
        <p>
          <a href="${nextStepUrl}">Preview My ${ctx.framework} Site</a>
        </p>
      </nav>
    </section>
  `;
}

async function validateBuilderSetup(
  ctx: BuilderSetupContext,
  url: URL | null | undefined
): Promise<BuilderSetupResult> {
  const result: BuilderSetupResult = {
    setupHtml: null,
    redirectUrl: null,
  };

  try {
    if (ctx.isValid || !url || !isPageRequest(url)) {
      // all good, already validated
      // or this is not a page request so don't bother
      return result;
    }

    // remember the dev server url that's being requested
    ctx.url = url;

    const setupStep = url.searchParams.get(BUILDER_CONNECT_KEY) as unknown as SetupStep;
    if (setupStep) {
      result.setupHtml = getSetupHtml(ctx, setupStep);
      if (result.setupHtml) {
        return result;
      }
    }

    const publicApiKey = url.searchParams.get(BUILDER_API_KEY_QS);
    if (publicApiKey) {
      // we've returned from the builder.io auth flow
      // querystring has the public api key
      // save it to the .env file
      await setBuilderPublicApiKey(ctx, publicApiKey);

      // let's redirect back to this same page
      // but without the api key in the querystring
      const nextUrl = new URL(url.pathname, url.origin);

      // set we want to see the next step
      nextUrl.searchParams.set(BUILDER_CONNECT_KEY, STEP_AUTH_SUCCESS);

      // set the redirect url the server should 302 to next
      result.redirectUrl = nextUrl.href;
      return result;
    }

    // check if the user has connected to builder
    const isValidBuilderApiKey = await hasValidBuilderApiKey(ctx);
    if (!isValidBuilderApiKey) {
      // not connected yet, respond with the setup UI
      result.setupHtml = getSetupHtml(ctx, STEP_OVERVIEW);
      return result;
    }

    // awesome, we're all set
    // the public key is saved correctly in the .env file
    // no need to respond with the setup UI
    ctx.isValid = true;
  } catch (e) {
    // collect the error and let the build decide how to handle it
    result.errors = [e.message];
  }

  return result;
}

async function setBuilderPublicApiKey(ctx: BuilderSetupContext, publicApiKey: string) {
  const envPath = getEnvPath(ctx);

  const comment = `# https://www.builder.io/c/docs/using-your-api-key`;

  if (!fs.existsSync(envPath)) {
    // create a new .env file
    const newEnv = [comment, `${BUILDER_API_KEY_ENV}=${publicApiKey}`, ``];
    await fs.promises.writeFile(envPath, newEnv.join('\n'));
    return;
  }

  let envContent = await fs.promises.readFile(envPath, 'utf-8');
  if (envContent.includes(BUILDER_API_KEY_ENV)) {
    // existing .env has a builder api key, replace it
    envContent = envContent.replace(
      new RegExp(`${BUILDER_API_KEY_ENV}=.*`),
      `${BUILDER_API_KEY_ENV}=${publicApiKey}`
    );
  } else {
    // existing .env does not have a builder api key, append it
    envContent += `\n\n${comment}\n${BUILDER_API_KEY_ENV}=${publicApiKey}\n\n`;
  }

  await fs.promises.writeFile(envPath, envContent);
}

async function hasValidBuilderApiKey(ctx: BuilderSetupContext): Promise<boolean> {
  const envPath = getEnvPath(ctx);

  if (!fs.existsSync(envPath)) {
    return false;
  }

  const envContent = await fs.promises.readFile(envPath, 'utf-8');

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
      return true;
    }
  }

  return false;
}

function getEnvPath(ctx: BuilderSetupContext) {
  return join(ctx.rootDir, '.env');
}

function isPageRequest(url: URL) {
  if (typeof url.pathname === 'string') {
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
  }
  return false;
}

async function createBuilderSetup(opts: CreateSetupOptions) {
  const ctx: BuilderSetupContext = {
    ...opts,
    isValid: false,
    url: null,
  };

  const builder: BuilderSetup = {
    validate: (url) => validateBuilderSetup(ctx, url),
  };
  return builder;
}

function getAuthConnectUrl(ctx: BuilderSetupContext) {
  const returnUrl = new URL(ctx.url!.pathname, ctx.url!.origin).href;

  const authUrl = new URL(`/cli-auth`, `https://builder.io`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('cli', 'true');
  authUrl.searchParams.set('client_id', ctx.clientId);
  authUrl.searchParams.set('host', ctx.clientHostname);
  authUrl.searchParams.set('redirect_url', returnUrl);
  return authUrl.href;
}

function getStepUrl(ctx: BuilderSetupContext, nextStep: SetupStep | null) {
  const nextUrl = new URL(ctx.url!.pathname, ctx.url!.origin);
  if (nextStep) {
    nextUrl.searchParams.set(BUILDER_CONNECT_KEY, nextStep);
  }
  return nextUrl.href;
}

interface CreateSetupOptions {
  rootDir: string;
  framework: string;
  clientId: string;
  clientHostname: string;
}

interface BuilderSetupContext extends CreateSetupOptions {
  isValid: boolean;
  url: URL | null;
}

interface BuilderSetup {
  validate: (url: URL | null | undefined) => Promise<BuilderSetupResult>;
}

interface BuilderSetupResult {
  setupHtml: string | null;
  redirectUrl: string | null;
  errors?: string[];
}

type SetupStep = 'overview' | 'success' | 'preview' | 'completed';

const BUILDER_API_KEY_ENV = `PUBLIC_BUILDER_API_KEY`;
const BUILDER_API_KEY_QS = `api-key`;
const BUILDER_CONNECT_KEY = `builder-connect`;
const STEP_OVERVIEW = `overview`;
const STEP_AUTH_SUCCESS = `success`;
const STEP_PREVIEW = `preview`;
const STEP_COMPLETED = `completed`;

export function builderio(): Plugin {
  let builder: BuilderSetup | null;
  let logger: Logger | null;

  return {
    name: 'builderioSetup',

    async configResolved(config) {
      logger = config.logger;
      builder = await createBuilderSetup({
        rootDir: config.root,
        framework: 'Qwik',
        clientId: 'create-qwik-app',
        clientHostname: hostname(),
      });
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
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

          if (result.setupHtml != null) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'max-age=0, no-cache, no-store');
            res.setHeader('X-Builder-Setup-Vite-Dev-Server', 'true');
            res.end(result.setupHtml);
            return;
          }

          if (result.redirectUrl != null) {
            res.writeHead(302, {
              Location: result.redirectUrl,
            });
            res.end();
            return;
          }
        }
        next();
      });
    },
  };
}
