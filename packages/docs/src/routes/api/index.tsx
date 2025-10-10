import { $, component$, isBrowser, useOn, useSignal, useStore, useTask$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { toSnakeCase } from '../../utils/utils';

// TODO: load the content of these files using fs instead of importing them
import qwikOptimizerApiData from './qwik-optimizer/api.json';
import qwikRouterMiddlewareAzureSwaApiData from './qwik-router-middleware-azure-swa/api.json';
import qwikRouterMiddlewareCloudflarePagesApiData from './qwik-router-middleware-cloudflare-pages/api.json';
import qwikRouterMiddlewareFirebaseApiData from './qwik-router-middleware-firebase/api.json';
import qwikRouterMiddlewareNetlifyEdgeApiData from './qwik-router-middleware-netlify-edge/api.json';
import qwikRouterMiddlewareNodeApiData from './qwik-router-middleware-node/api.json';
import qwikRouterMiddlewareRequestHandlerApiData from './qwik-router-middleware-request-handler/api.json';
import qwikRouterMiddlewareVercelEdgeApiData from './qwik-router-middleware-vercel-edge/api.json';
import qwikRouterSsgApiData from './qwik-router-ssg/api.json';
import qwikRouterViteAzureSwaApiData from './qwik-router-vite-azure-swa/api.json';
import qwikRouterViteCloudRunApiData from './qwik-router-vite-cloud-run/api.json';
import qwikRouterViteCloudflarePagesApiData from './qwik-router-vite-cloudflare-pages/api.json';
import qwikRouterViteNetlifyEdgeApiData from './qwik-router-vite-netlify-edge/api.json';
import qwikRouterViteNodeServerApiData from './qwik-router-vite-node-server/api.json';
import qwikRouterViteSsgApiData from './qwik-router-vite-ssg/api.json';
import qwikRouterViteVercelApiData from './qwik-router-vite-vercel/api.json';
import qwikRouterApiData from './qwik-router/api.json';
import qwikServerApiData from './qwik-server/api.json';
import qwikTestingApiData from './qwik-testing/api.json';
import qwikApiData from './qwik/api.json';

const _KINDS = new Set<string>();

const apiData = {
  qwik: qwikApiData,
  'qwik-router': qwikRouterApiData,
  'qwik-router-middleware-azure-swa': qwikRouterMiddlewareAzureSwaApiData,
  'qwik-router-middleware-cloudflare-pages': qwikRouterMiddlewareCloudflarePagesApiData,
  'qwik-router-middleware-netlify-edge': qwikRouterMiddlewareNetlifyEdgeApiData,
  'qwik-router-middleware-node': qwikRouterMiddlewareNodeApiData,
  'qwik-router-middleware-request-handler': qwikRouterMiddlewareRequestHandlerApiData,
  'qwik-router-middleware-vercel-edge': qwikRouterMiddlewareVercelEdgeApiData,
  'qwik-router-middleware-firebase': qwikRouterMiddlewareFirebaseApiData,
  'qwik-router-ssg': qwikRouterSsgApiData,
  'qwik-router-vite-azure-swa': qwikRouterViteAzureSwaApiData,
  'qwik-router-vite-cloud-run': qwikRouterViteCloudRunApiData,
  'qwik-router-vite-cloudflare-pages': qwikRouterViteCloudflarePagesApiData,
  'qwik-router-vite-node-server': qwikRouterViteNodeServerApiData,
  'qwik-router-vite-netlify-edge': qwikRouterViteNetlifyEdgeApiData,
  'qwik-router-vite-ssg': qwikRouterViteSsgApiData,
  'qwik-router-vite-vercel': qwikRouterViteVercelApiData,
  'qwik-optimizer': qwikOptimizerApiData,
  'qwik-server': qwikServerApiData,
  'qwik-testing': qwikTestingApiData,
};

const getUniqueKinds = () => {
  if (_KINDS.size) {
    return _KINDS;
  }

  apiData['qwik'].members.forEach((member) => _KINDS.add(toSnakeCase(member.kind)));
  return _KINDS;
};

const getInitialFilterState = () => {
  return (
    Array.from(getUniqueKinds()).reduce((acc: any, kind) => {
      if (typeof kind !== 'string') {
        return acc;
      }
      acc[kind] = true;
      return acc;
    }, {}) || {}
  );
};

export default component$(() => {
  const filters = useStore(getInitialFilterState());

  return (
    <>
      <h1 class="overview">API Reference</h1>

      <h2>Filters</h2>
      <div class="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-10">
        {Array.from(getUniqueKinds()).map((kind) => (
          <button
            key={`filter-${kind}`}
            onClick$={() => {
              filters[kind] = !filters[kind];
            }}
            class={`filter-item block text-sm rounded-md text-left ${
              filters[kind] ? 'active' : ''
            }`}
            data-kind-label={kind.substring(0, 1).toUpperCase()}
          >
            {kind.split('-').join(' ')}
          </button>
        ))}
      </div>

      <h2>References</h2>
      {Object.keys(apiData).map((key) => (
        <ApiMemberWrapper key={`api-member-wrapper-${apiData[key as keyof typeof apiData].id}`} id={apiData[key as keyof typeof apiData].id} data={apiData[key as keyof typeof apiData]} filters={filters} />
      ))}
    </>
  );
});

export const ApiMemberWrapper = component$(({ id, data, filters }: any) => {
  const isCollapsed = useSignal(true);

  useTask$(({track}) => {
    track(filters);
    if (isBrowser) {
      isCollapsed.value = false;
    }
  });

  // TODO: find a solution to get this work
  useOn('beforematch', $(() => {
    isCollapsed.value = false;
  }));

  if(!data.members.length) {
    return null;
  }

  return (
    <div class={`section ${isCollapsed.value}`}>
      <h2
        data-icon={isCollapsed.value ? '→' : '↓'}
        class="section-title cursor-pointer"
        onClick$={() => isCollapsed.value = !isCollapsed.value }
      >
        <span>{data.id}</span>
      </h2>
      <div hidden={isCollapsed.value ? 'until-found' : false}>
        <ApiMemberList id={id} data={data} filters={filters} />
      </div>
    </div>
  );
});


export const ApiMemberList = component$(({ id, data, filters }: any) => (
  <ul class="grid sm:grid-cols-2 lg:grid-cols-3 pb-5">
    {data.members.map((member: any) => {
      const kind = toSnakeCase(member.kind);

      if (!member.name) {
        return;
      }

      const name = member.name.toLowerCase()
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/ /g, '-');


      return (
        <li
          key={`${id}-member-${member.id}-${kind}`}
          data-kind={kind}
          data-kind-label={kind.substring(0, 1).toUpperCase()}
          class={`api-item list-none text-xs ${
            (kind in filters && !filters[kind] && 'hidden') || ''
          }`}
        >
          <Link href={`${data.id}#${name}`}>{member.name}</Link>
        </li>
      );
    })}
  </ul>
));
