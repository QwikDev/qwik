import type { RenderOptions, StreamWriter } from '@builder.io/qwik';
import type { QwikManifest } from '@builder.io/qwik/optimizer';
import type {
  PrefetchResource,
  Render,
  RenderResult,
  RenderToStringResult,
} from '@builder.io/qwik/server';
import type { ClientPageData, QwikCityEnvData } from '../../runtime/src/library/types';
import { getErrorHtml } from './error-handler';
import { HttpStatus } from './http-status-codes';
import type { QwikCityRequestContext, UserResponseContext } from './types';

export function pageHandler<T = any>(
  requestCtx: QwikCityRequestContext,
  userResponse: UserResponseContext,
  render: Render,
  opts?: RenderOptions,
  routeBundleNames?: string[]
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
    try {
      const result = await render({
        stream: isPageData ? noopStream : stream,
        envData: getQwikCityEnvData(userResponse),
        ...opts,
      });

      if (isPageData) {
        // write just the page json data to the response body
        stream.write(
          JSON.stringify(await getClientPageData(userResponse, result, routeBundleNames))
        );
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
        stream.clientData(await getClientPageData(userResponse, result, routeBundleNames));
      }
    } catch (e) {
      const errorHtml = getErrorHtml(HttpStatus.InternalServerError, e);
      stream.write(errorHtml);
    }
  });
}

async function getClientPageData(
  userResponse: UserResponseContext,
  result: RenderResult,
  routeBundleNames: string[] | undefined
) {
  const prefetchBundleNames = getPrefetchBundleNames(result, routeBundleNames);

  const isStatic = !result.snapshotResult?.resources.some((r) => r._cache !== Infinity);
  const clientPage: ClientPageData = {
    body: userResponse.pendingBody ? await userResponse.pendingBody : userResponse.resolvedBody,
    status: userResponse.status !== 200 ? userResponse.status : undefined,
    redirect:
      (userResponse.status >= 301 &&
        userResponse.status <= 308 &&
        userResponse.headers.get('location')) ||
      undefined,
    isStatic,
    prefetch: prefetchBundleNames.length > 0 ? prefetchBundleNames : undefined,
  };

  return clientPage;
}

function getPrefetchBundleNames(result: RenderResult, routeBundleNames: string[] | undefined) {
  const bundleNames: string[] = [];

  const addBundle = (bundleName: string | undefined) => {
    if (bundleName && !bundleNames.includes(bundleName)) {
      bundleNames.push(bundleName);
    }
  };

  const addPrefetchResource = (prefetchResources: PrefetchResource[]) => {
    if (Array.isArray(prefetchResources)) {
      for (const prefetchResource of prefetchResources) {
        const bundleName = prefetchResource.url.split('/').pop();
        if (bundleName && !bundleNames.includes(bundleName)) {
          addBundle(bundleName);
          addPrefetchResource(prefetchResource.imports);
        }
      }
    }
  };

  addPrefetchResource(result.prefetchResources);

  const manifest: QwikManifest | undefined = result.manifest || (result as any)._manifest;
  const renderedSymbols = result._symbols;

  if (manifest && renderedSymbols) {
    // add every component on this page
    for (const renderedSymbolName of renderedSymbols) {
      const symbol = manifest.symbols[renderedSymbolName];
      if (symbol && symbol.ctxName === 'component$') {
        addBundle(manifest.mapping[renderedSymbolName]);
      }
    }
  }

  if (routeBundleNames) {
    for (const routeBundleName of routeBundleNames) {
      addBundle(routeBundleName);
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
