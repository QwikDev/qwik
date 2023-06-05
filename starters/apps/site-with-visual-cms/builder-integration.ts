import type { Logger, Plugin } from 'vite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir, hostname } from 'node:os';
import { request } from 'node:https';
import { IncomingMessage } from 'node:http';

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
function setupOverviewStep(ctx: BuilderSetupContext, url: URL) {
  debug(`show overview step`);
  const nextStepUrl = getAuthConnectUrl(ctx, url);

  return html(`
    <aside>
      <ul>
        <li class="active">
          Overview
        </li>
        <li>
          Connect Builder.io
        </li>
        <li>
          Setup Content Page
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

/**
 * Returning from the builder.io auth flow, show the next step in the setup process.
 */
function connectedToBuilderStep(ctx: BuilderSetupContext, url: URL, backgroundUpdate: boolean) {
  debug(`show connected to builder step (background update: ${backgroundUpdate})`);
  const appBaseUrl = getAppBaseUrl(ctx, url).pathname;
  const connectedStepUrl = getConnectedStepUrl(ctx, url);
  const backgroundUpdateUrl = getBackgroundUpdateUrl(ctx, url);

  return html(`
    <aside>
      <ul>
        <li class="completed">
          Overview
        </li>
        <li class="active">
          Connect Builder.io
        </li>
        <li>
          Setup Content Page
        </li>
      </ul>
    </aside>
    <section>
      <h1>
        Visual CMS Connected
      </h1>
      <p>
        Great! Your ${ctx.framework} app has been connected to the Builder.io Visual CMS.
      </p>
      <p>
        Next let's connect Builder.io so you can start editing and publishing content.
      </p>
      <nav>
        <p>
          <a id="next" disabled href="${appBaseUrl}">Next</a>
        </p>
      </nav>
    </section>
    ${
      backgroundUpdate
        ? `
          <script>
            history.replaceState({}, "", "${connectedStepUrl}");
            fetch("${backgroundUpdateUrl}").then((rsp) => {
              if (rsp.ok) {
                document.getElementById("next").removeAttribute("disabled");
              } else {
                console.error("Failed to update Builder.io page", rsp.status);
                rsp.text().then((text) => {
                  console.error(text);
                });
              }
            }).catch((err) => {
              console.error(err);
            });
          </script>
          `
        : ``
    }
  `);
}

function getDefaultHomepage(ctx: BuilderSetupContext) {
  return JSON.stringify({
    '@version': 4,
    name: DEFAULT_HOMEPAGE_PAGE_NAME,
    ownerId: ctx.credentials.publicApiKey,
    published: 'published',
    query: [
      {
        '@type': '@builder.io/core:Query',
        property: 'urlPath',
        value: ctx.appBasePathname,
        operator: 'is',
      },
    ],
    data: {
      blocksString: DEFAULT_HOMEPAGE_BLOCK,
      title: DEFAULT_HOMEPAGE_PAGE_NAME,
      url: ctx.appBasePathname,
    },
  });
}

const DEFAULT_HOMEPAGE_PAGE_NAME = `Homepage`;
const DEFAULT_HOMEPAGE_BLOCK = `[{"@type":"@builder.io/sdk:Element","@version":2,"id":"builder-b3e7bacb8fc740109a8154507ad3f39b","component":{"name":"Text","options":{"text":"<h1>Hello Qwik!</h1>"}},"responsiveStyles":{"large":{"display":"flex","flexDirection":"column","position":"relative","flexShrink":"0","boxSizing":"border-box","marginTop":"20px","lineHeight":"normal","height":"auto","marginLeft":"auto","marginRight":"auto"}}},{"@type":"@builder.io/sdk:Element","@version":2,"id":"builder-15627179727f4fcba1246a6da5e8ae67","component":{"name":"Image","options":{"image":"https://cdn.builder.io/api/v1/image/assets%2F4025e37ed968472fac153d65c579ca46%2Fb2a221368b714e8991e94790bb3a0068","backgroundSize":"cover","backgroundPosition":"center","lazy":false,"fitContent":true,"aspectRatio":1.333,"lockAspectRatio":false,"height":1300,"width":975}},"responsiveStyles":{"large":{"display":"flex","flexDirection":"column","position":"relative","flexShrink":"0","boxSizing":"border-box","marginTop":"20px","width":"100%","minHeight":"20px","minWidth":"20px","overflow":"hidden"}}}]`;

async function validateBuilderIntegration(
  ctx: BuilderSetupContext,
  url: URL
): Promise<BuilderIntegrationResult> {
  const result: BuilderIntegrationResult = {};

  try {
    if (ctx.isValid || !isPageRequest(url)) {
      // all good, already validated
      // or this is not a page request so don't bother
      return result;
    }

    // get the keys from the querystring (if they exist)
    const qsPublicApiKey = url.searchParams.get(BUILDER_PUBLIC_API_KEY_QS);
    const qsPrivateAuthKey = url.searchParams.get(BUILDER_PRIVATE_AUTH_KEY_QS);

    // check if we're returning from the builder.io auth flow
    if (qsPublicApiKey && qsPrivateAuthKey) {
      debug(`url has auth keys`);
      // we've returned from the builder.io auth flow
      // and have the auth keys in the querystring
      ctx.credentials = {
        publicApiKey: qsPublicApiKey,
        privateAuthKey: qsPrivateAuthKey,
      };

      if (url.searchParams.get(BUILDER_SETUP_STEP_QS) === BUILDER_UPDATE_STEP) {
        debug(`step: ${BUILDER_UPDATE_STEP}`);
        // handle the background fetch() request that should:
        // - create the homepage
        // - write the private auth key to the user's home directory
        // - update the .env file with the public api key

        // see if this builder account already has a homepage created
        const hasHomepage = await hasBuilderHomepage(ctx);
        if (!hasHomepage) {
          // there is no homepage content created yet
          // create the default homepage for them
          await createBuilderHomepage(ctx);
        }

        // write the app credientials to the user's home directory builder config
        setBuilderAppCredentials(ctx);

        // write the api key it to the app's .env file
        // writing to the .env file will trigger a server restart
        setBuilderPublicApiKey(ctx);

        // set the result to show the connected to builder step
        result.html = `set public api key: ${ctx.credentials.publicApiKey}`;
        return result;
      }

      // returning from auth flow then redirected to this page
      // show that we're connected to builder
      // In the background we'll fire off a fetch() that will:
      // - create the homepage
      // - write the private auth key to the user's home directory
      // - update the .env file with the public api key
      // - updating the .env file will trigger a server restart
      result.html = connectedToBuilderStep(ctx, url, true);
      return result;
    }

    // get the builder public api key from the .env file
    const envApiKey = getBuilderApiKey(ctx);
    if (!envApiKey) {
      debug(`invalid api key in .env file`);
      // we don't have a valid api key saved in the .env file
      // respond with the first step of setup UI
      result.html = setupOverviewStep(ctx, url);
      return result;
    }

    debug(`public api key from the .env file: ${envApiKey}`);

    // set the public api key in the process.env
    // dotenv will normally do this on a fresh server start
    process.env[BUILDER_API_KEY_ENV] = envApiKey;

    // get the private api key from the user home dir builder config file
    const appCredentials = getBuilderAppCredentials(ctx, envApiKey);
    if (!appCredentials) {
      debug(`invalid app credentials in user home dir`);
      // we don't have a valid private key saved in the user home dir config
      // respond with the first step of setup UI
      result.html = setupOverviewStep(ctx, url);
      return result;
    }

    // remember the valid app credentials
    ctx.credentials = appCredentials;

    if (url.searchParams.get(BUILDER_SETUP_STEP_QS) === BUILDER_CONNECTED_STEP) {
      debug(`step: ${BUILDER_CONNECTED_STEP}`);
      // continue showing the connected step
      // we may have reloaded the page and forgetten the context
      // at this point don't do a background fetch() update
      result.html = connectedToBuilderStep(ctx, url, false);
      return result;
    }

    // it's possible that the builder auth is setup, but they still don't have a homepage somehow
    // double check if this builder account already has a homepage created
    const hasHomepage = await hasBuilderHomepage(ctx);
    if (!hasHomepage) {
      debug(`no homepage created yet`);
      // there is no homepage content created yet for the valid public api key
      // we don't have their private key, so let's redirect to the auth flow
      // so we can get their private key and create the homepage for them
      // respond with the first step of setup UI
      result.html = setupOverviewStep(ctx, url);
      return result;
    }

    // awesome, we're all set
    // the public key is saved correctly in the .env file
    // and they have a homepage created
    // no need to respond with the setup UI
    // set isValid to true so we don't have to validate again
    debug(`set is valid`);
    ctx.isValid = true;
  } catch (e: any) {
    // collect the error and let the build decide how to handle it
    result.errors = [e.message];
  }

  return result;
}

async function hasBuilderHomepage(ctx: BuilderSetupContext) {
  try {
    const url = new URL(`https://cdn.builder.io/api/v3/content/page`);
    url.searchParams.set(`apiKey`, ctx.credentials.publicApiKey);
    url.searchParams.set(`url`, ctx.appBasePathname);
    url.searchParams.set(`cachebust`, Math.random().toString());

    const res = await requestJSON<{ results: any[] }>({
      url,
      method: 'GET',
    });

    const hasHomepage = res.results.length > 0;
    debug(`has homepage: ${hasHomepage}`);
    return hasHomepage;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function createBuilderHomepage(ctx: BuilderSetupContext) {
  debug(`create homepage`);
  const url = new URL(`https://cdn.builder.io/api/v1/write/page`);

  const body = getDefaultHomepage(ctx);

  await requestJSON({
    url,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.credentials.privateAuthKey}`,
    },
    body,
  });
}

function setBuilderPublicApiKey(ctx: BuilderSetupContext) {
  const comment = `# https://www.builder.io/c/docs/using-your-api-key`;

  // check if we already have an .env file
  if (existsSync(ctx.envFilePath)) {
    // read the existing .env file
    let envContent = readFileSync(ctx.envFilePath, 'utf-8');
    if (envContent.includes(BUILDER_API_KEY_ENV)) {
      // existing .env has a builder api key already, update its value
      if (!envContent.includes(ctx.credentials.publicApiKey)) {
        // existing .env has a builder api key, but it's not the same as the one we have
        debug(`update public api key in existing .env file`);
        envContent = envContent.replace(
          new RegExp(`${BUILDER_API_KEY_ENV}=.*`),
          `${BUILDER_API_KEY_ENV}=${ctx.credentials.publicApiKey}`
        );
        writeFileSync(ctx.envFilePath, envContent);
      } else {
        debug(`public api key already in existing .env file`);
      }
    } else {
      // existing .env does not have a builder api key, append the key/value
      debug(`append public api key to existing .env file`);
      envContent += `\n\n${comment}\n${BUILDER_API_KEY_ENV}=${ctx.credentials.publicApiKey}\n\n`;
      writeFileSync(ctx.envFilePath, envContent);
    }
  } else {
    // create a new .env file since it doesn't exist yet
    debug(`create .env file with public api key`);
    const newEnv = [comment, `${BUILDER_API_KEY_ENV}=${ctx.credentials.publicApiKey}`, ``];
    writeFileSync(ctx.envFilePath, newEnv.join('\n'));
  }
}

function getBuilderApiKey(ctx: BuilderSetupContext) {
  if (existsSync(ctx.envFilePath)) {
    const envContent = readFileSync(ctx.envFilePath, 'utf-8');

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

function getBuilderAppCredentials(ctx: BuilderSetupContext, publicApiKey: string) {
  try {
    const credintialsFilePath = getCredentialsFilePath(ctx, publicApiKey);
    const config = readFileSync(credintialsFilePath, 'utf-8');
    return JSON.parse(config) as BuilderAppCredentials;
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      return null;
    }
    throw e;
  }
}

function setBuilderAppCredentials(ctx: BuilderSetupContext) {
  debug(`set credentials`);
  const credintialsFilePath = getCredentialsFilePath(ctx, ctx.credentials.publicApiKey);
  mkdirSync(dirname(credintialsFilePath), { recursive: true });
  writeFileSync(credintialsFilePath, JSON.stringify(ctx.credentials, null, 2));
}

function getCredentialsFilePath(ctx: BuilderSetupContext, publicApiKey: string) {
  return join(ctx.credentialsDirPath, `${publicApiKey}.json`);
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

function interceptPageRequest(ctx: BuilderSetupContext) {
  const result: BuilderIntegrationResult = {};

  if (ctx.isValid) {
    try {
      result.html = `<script id="builder-dev-tools">(function(){\n${getBuilderDevToolsRuntime()}\n})();</script>
    `;
    } catch (e: any) {
      result.errors = [e.message];
    }
  }

  return result;
}

function getBuilderDevToolsRuntime() {
  return `
  try {
    const editButton = document.createElement('builder-dev-tools-edit-button');
    editButton.style.display = 'none';
    editButton.setAttribute('aria-hidden', 'true');

    function onPointerOver(ev) {
      const hoverElm = ev.target;
      if (!hoverElm) {
        hideEditButton();
        return;
      }

      if (hoverElm.closest('builder-dev-tools-edit-button')) {
        return;
      }

      const contentElm = hoverElm.closest('[builder-content-id]');
      const builderElm = hoverElm.closest('[builder-id]');
      if (!contentElm || !builderElm) {
        hideEditButton();
        return;
      }

      const contentId = contentElm.getAttribute('builder-content-id');
      const builderId = builderElm.getAttribute('builder-id');
      if (!contentId || !builderId) {
        hideEditButton();
        return;
      }

      const rect = builderElm.getBoundingClientRect();
      editButton.style.display = 'block';
      editButton.style.top = (builderElm.offsetTop - 1) + 'px';
      editButton.style.left = (builderElm.offsetLeft) + 'px';
      editButton.style.width = (rect.width - 2) + 'px';
      editButton.style.height = (rect.height - 2) + 'px';
      editButton.setEditUrl(contentId, builderId);
    }

    function hideEditButton() {
      editButton.style.display = 'none';
    }

    class BuilderDevToolsEditButton extends HTMLElement {
      constructor() {
        super();
        this.shadow = this.attachShadow({ mode: 'open' });
      }

      connectedCallback() {
        this.shadow.innerHTML = \`
        <style>
          :host { 
            --builder-blue: rgb(26, 115, 232);
            box-sizing: border-box;
            position: absolute;
            z-index: 100;
            user-select: none;
          }
          a {
            display: inline-block;
            box-sizing: border-box;
            padding: 4px;
          }
          a span {
            display: inline-block;
            box-sizing: border-box;
            padding: 4px 8px;
            font-size: 12px;
            font-weight: 500;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: white;
            background-color: var(--builder-blue);
            border: 1px solid transparent;
            border-radius: 3px;
            text-align: center;
            box-shadow: rgba(0, 0, 0, 0.2) 0px 1px 3px 0px, rgba(0, 0, 0, 0.14) 0px 1px 1px 0px, rgba(0, 0, 0, 0.12) 0px 2px 1px -1px;
            text-decoration: none;
            pointer-events: none;
          }
          a:hover span {
            border-color: var(--builder-blue);
            color: var(--builder-blue);
            background: white;
          }
          .outline {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            border: 1px solid var(--builder-blue);
          }
        </style>
        <a id="edit" target="_blank"><span>Edit</span></a>
        <div class="outline"></div>
        \`;

        this.editButton = this.shadow.getElementById('edit');
      }

      setEditUrl(contentId, builderId) {
        const pathname = '/content/' + contentId + '/edit';
        const url = new URL(pathname, 'https://builder.io');
        url.searchParams.set('selectedBlock', builderId);
        this.editButton.href = url.href;
      }
    }

    customElements.define('builder-dev-tools-edit-button', BuilderDevToolsEditButton);
    document.body.appendChild(editButton);

    document.addEventListener('pointerover', onPointerOver, { passive: true });
    document.addEventListener('pointerleave', hideEditButton, { passive: true });
    document.addEventListener('pointercancel', hideEditButton, { passive: true });
    document.addEventListener('visibilitychange', hideEditButton, { passive: true });

    window.addEventListener('popstate', hideEditButton, { passive: true });

    const originalPushState = history.pushState;
    history.pushState = function () {
      hideEditButton();
      originalPushState.apply(this, arguments);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function () {
      hideEditButton();
      originalReplaceState.apply(this, arguments);
    };
  } catch (e) {
    console.error(e);
  }
  `;
}

function createBuilderSetup(opts: CreateSetupOptions) {
  const ctx: BuilderSetupContext = {
    ...opts,
    credentials: {
      publicApiKey: '',
      privateAuthKey: '',
    },
    isValid: false,
  };

  const builder: BuilderIntegration = {
    intercept: () => interceptPageRequest(ctx),
    validate: (url) => validateBuilderIntegration(ctx, url),
  };
  return builder;
}

/**
 * Get the auth url to connect to builder, and the url to redirect to after connecting
 */
function getAuthConnectUrl(ctx: BuilderSetupContext, url: URL) {
  const authUrl = new URL(`/cli-auth`, `https://builder.io`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('cli', 'true');
  authUrl.searchParams.set('client_id', ctx.clientId);
  authUrl.searchParams.set('host', ctx.clientHostname);

  const returnUrl = getAppBaseUrl(ctx, url).href;
  authUrl.searchParams.set('redirect_url', returnUrl);

  return authUrl.href;
}

function getAppBaseUrl(ctx: BuilderSetupContext, url: URL) {
  return new URL(ctx.appBasePathname, url.origin);
}

function getConnectedStepUrl(ctx: BuilderSetupContext, url: URL) {
  const appBaseUrl = getAppBaseUrl(ctx, url);
  appBaseUrl.searchParams.set(BUILDER_SETUP_STEP_QS, BUILDER_CONNECTED_STEP);
  return appBaseUrl.pathname + appBaseUrl.search;
}

function getBackgroundUpdateUrl(ctx: BuilderSetupContext, url: URL) {
  const appBaseUrl = getAppBaseUrl(ctx, url);
  appBaseUrl.searchParams.set(BUILDER_SETUP_STEP_QS, BUILDER_UPDATE_STEP);
  appBaseUrl.searchParams.set(BUILDER_PUBLIC_API_KEY_QS, ctx.credentials.publicApiKey);
  appBaseUrl.searchParams.set(BUILDER_PRIVATE_AUTH_KEY_QS, ctx.credentials.privateAuthKey);
  return appBaseUrl.pathname + appBaseUrl.search;
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

const BUILDER_API_KEY_ENV = `PUBLIC_BUILDER_API_KEY`;
const BUILDER_PUBLIC_API_KEY_QS = `api-key`;
const BUILDER_PRIVATE_AUTH_KEY_QS = `p-key`;
const BUILDER_SETUP_STEP_QS = `builder-connect`;
const BUILDER_UPDATE_STEP = `update`;
const BUILDER_CONNECTED_STEP = `connected`;

/**
 * Vite plugin that adds builder.io setup UI
 */
export function builderDevTools(opts: BuilderioOptions = {}): Plugin {
  let builder: BuilderIntegration | undefined;
  let logger: Logger | undefined;
  let port: number | undefined;

  return {
    name: 'builderDevTools',

    configResolved(config) {
      logger = config.logger;
      port = config.server.port;
      builder = createBuilderSetup({
        appBasePathname: config.base,
        clientHostname: hostname(),
        clientId: 'create-qwik-app',
        credentialsDirPath: join(homedir(), `.config`, `builder`),
        envFilePath: opts.envFilePath || join(config.root, `.env`),
        framework: 'Qwik',
      });
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        req.socket.address();

        const orgResponseEnd = res.end;
        res.end = function (...args: any[]) {
          if (builder) {
            const contentType = (res.getHeader('Content-Type') || '').toString();

            if (contentType.includes('text/html')) {
              const result = builder.intercept();
              if (result.errors && logger) {
                result.errors.map((e) => logger!.error(e));
              }
              if (result.html) {
                res.write(result.html);
              }
            }
          }

          return orgResponseEnd.apply(this, args);
        };

        // add Vite dev server middleware that
        // shows builder setup UI if needed
        if (builder) {
          const url = getNodeHttpUrl(port, req);

          const result = await builder.validate(url);

          if (result.errors && logger) {
            result.errors.map((e) => logger!.error(e));
          }

          if (result.html) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'max-age=0, no-cache, no-store');
            res.setHeader('X-Builderio-Vite-Dev-Server', 'true');
            res.end(result.html);
            return;
          }
        }
        next();
      });
    },
  };
}

function getNodeHttpUrl(port: number | undefined, req: IncomingMessage) {
  const a = req.socket.address();
  const address = 'address' in a && typeof a.address === 'string' ? a.address : 'localhost';
  port = 'port' in a && typeof a.port === 'number' ? a.port : port;

  return new URL(req.url || '/', `http://${address}:${port}`);
}

function debug(...args: any[]) {
  if (process.env.DEBUG) {
    // eslint-disable-next-line no-console
    console.debug('[builder.io]', ...args);
  }
}

export interface BuilderioOptions {
  /**
   * Absolute path to the project's `.env` file.
   */
  envFilePath?: string;
}

interface CreateSetupOptions {
  appBasePathname: string;
  clientHostname: string;
  clientId: string;
  credentialsDirPath: string;
  envFilePath: string;
  framework: string;
}

interface BuilderSetupContext extends CreateSetupOptions {
  isValid: boolean;
  credentials: BuilderAppCredentials;
}

interface BuilderIntegration {
  intercept: () => BuilderIntegrationResult;
  validate: (url: URL) => Promise<BuilderIntegrationResult>;
}

interface BuilderIntegrationResult {
  html?: string;
  errors?: string[];
}

interface BuilderAppCredentials {
  publicApiKey: string;
  privateAuthKey: string;
}

interface RequestOptions {
  url: URL;
  headers?: Record<string, string>;
  method?: string;
  body?: any;
}
