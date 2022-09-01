import type { StreamWriter } from '@builder.io/qwik';
import type {
  PrefetchResource,
  Render,
  RenderResult,
  RenderToStringResult,
} from '@builder.io/qwik/server';
import type { ClientPageData, QwikCityEnvData } from '../../runtime/src/library/types';
import type { QwikCityRequestContext, QwikCityRequestOptions, UserResponseContext } from './types';

export function pageHandler<T = any>(
  requestCtx: QwikCityRequestContext,
  userResponse: UserResponseContext,
  render: Render,
  opts?: QwikCityRequestOptions
): Promise<T> {
  const { status, headers } = userResponse;
  const { response } = requestCtx;
  const isPageData = userResponse.type === 'pagedata';

  if (isPageData) {
    // page data should always be json
    headers.set('Content-Type', 'application/json; charset=utf-8');
  } else if (!headers.has('Content-Type')) {
    // default to text/html if Content-Type wasn't provided
    headers.set('Content-Type', 'text/html; charset=utf-8');
  }

  return response(isPageData ? 200 : status, headers, async (stream) => {
    // begin http streaming the page content as it's rendering html
    const result = await render({
      stream: isPageData ? noopStream : stream,
      envData: getQwikCityEnvData(userResponse),
      ...opts,
    });

    if (isPageData) {
      // write just the page json data to the response body
      stream.write(JSON.stringify(await getClientPageData(userResponse, result)));
    } else {
      if ((typeof result as any as RenderToStringResult).html === 'string') {
        // render result used renderToString(), so none of it was streamed
        // write the already completed html to the stream
        stream.write((result as any as RenderToStringResult).html);
      }
    }

    if (typeof stream.clientData === 'function') {
      // a data fn was provided by the request context
      // useful for writing q-data.json during SSG
      stream.clientData(await getClientPageData(userResponse, result));
    }
  });
}

async function getClientPageData(userResponse: UserResponseContext, result: RenderResult) {
  const prefetchBundleNames = getPrefetchBundleNames(result);

  const clientPage: ClientPageData = {
    body: userResponse.pendingBody ? await userResponse.pendingBody : userResponse.resolvedBody,
    prefetch: prefetchBundleNames.length > 0 ? prefetchBundleNames : undefined,
    status: userResponse.status,
  };
  if (
    userResponse.status >= 301 &&
    userResponse.status <= 308 &&
    userResponse.headers.has('location')
  ) {
    clientPage.redirect = userResponse.headers.get('location')!;
  }
  return clientPage;
}

function getPrefetchBundleNames(result: RenderResult) {
  const bundleNames: string[] = [];

  const addPrefetchResource = (prefetchResources: PrefetchResource[]) => {
    if (Array.isArray(prefetchResources)) {
      for (const prefetchResource of prefetchResources) {
        const bundleName = prefetchResource.url.split('/').pop();
        if (bundleName && !bundleNames.includes(bundleName)) {
          bundleNames.push(bundleName);
          addPrefetchResource(prefetchResource.imports);
        }
      }
    }
  };

  addPrefetchResource(result.prefetchResources);

  const manifest = result._manifest;
  const renderedSymbols = result._symbols;

  if (manifest && renderedSymbols) {
    for (const renderedSymbolName of renderedSymbols) {
      const symbol = manifest.symbols[renderedSymbolName];
      if (symbol && symbol.ctxName === 'component$') {
        const bundleName = manifest.mapping[renderedSymbolName];
        if (bundleName && !bundleNames.includes(bundleName)) {
          bundleNames.push(bundleName);
        }
      }
    }

    for (const [symbolName, symbol] of Object.entries(manifest.symbols)) {
      if (symbol.displayName === 'QwikCity_component_useWatch') {
        const bundleName = manifest.mapping[symbolName];
        const bundle = manifest.bundles[bundleName];
        if (bundle && Array.isArray(bundle.dynamicImports)) {
          for (const dynamicImportName of bundle.dynamicImports) {
            if (dynamicImportName && !bundleNames.includes(dynamicImportName)) {
              bundleNames.push(dynamicImportName);
            }
          }
        }
        break;
      }
    }
  }

  return bundleNames;
}

export function getQwikCityEnvData(userResponse: UserResponseContext): {
  url: string;
  qwikcity: QwikCityEnvData;
} {
  const { url, params, pendingBody, resolvedBody, status } = userResponse;
  return {
    url: url.href,
    qwikcity: {
      params: { ...params },
      response: {
        body: pendingBody || resolvedBody,
        status: status,
      },
    },
  };
}

const noopStream: StreamWriter = { write: () => {} };
