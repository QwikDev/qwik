import { component$ } from '@builder.io/qwik';
import { Link, routeLoader$ } from '@builder.io/qwik-city';
import AppCard from '~/components/app-card';
import Container from '~/components/container';
import { ErrorIcon } from '~/components/icons/error';
import { SlowIcon } from '~/components/icons/slow';
import { SymbolIcon } from '~/components/icons/symbol';
import Layout from '~/components/layout';
import { getDB } from '~/db';
import { getAppInfo, getSymbolEdgeCount } from '~/db/query';
import { AppLink } from '~/routes.config';
import styles from './styles.module.css';
import { EditIcon } from '~/components/icons/edit';

export const useAppData = routeLoader$(async ({ params }) => {
  const db = getDB();
  const publicApiKey = params.publicApiKey;
  const [app, symbolCount] = await Promise.all([
    getAppInfo(db, publicApiKey),
    getSymbolEdgeCount(db, publicApiKey),
  ]);
  return { app, symbolCount };
});

export default component$(() => {
  const data = useAppData();
  return (
    <Layout class={styles['no-padding-left']}>
      <div class={styles.container}>
        <aside class={styles.aside}>
          <div class={styles.menu}>
            <Link href="./edit" class={styles['menu-item']}>
              <EditIcon />
              <span class={styles['menu-item-label']}>Edit</span>
            </Link>
            <Link href="./edit" class={styles['menu-item']}>
              <EditIcon />
              <span class={styles['menu-item-label']}>Symbols</span>
            </Link>
            <Link href="./edit" class={styles['menu-item']}>
              <EditIcon />
              <span class={styles['menu-item-label']}>Edge</span>
            </Link>
            <Link href="./edit" class={styles['menu-item']}>
              <EditIcon />
              <span class={styles['menu-item-label']}>Bundles</span>
            </Link>
            <Link href="./edit" class={styles['menu-item']}>
              <EditIcon />
              <span class={styles['menu-item-label']}>Slow Symbols</span>
            </Link>
            <Link href="./edit" class={styles['menu-item']}>
              <EditIcon />
              <span class={styles['menu-item-label']}>Errors</span>
            </Link>
          </div>
        </aside>

        <div class="p-4 sm:ml-64">
          <div class="p-4 border-2 border-gray-200 border-dashed rounded-lg dark:border-gray-700">
            <AppCard
              title={data.value.app.name}
              publicApiKey={data.value.app.publicApiKey}
              description={data.value.app.description}
              mode="show"
            />
            <div>
              <span>Edge count: {data.value.symbolCount}</span>
              <ul>
                <li>
                  <AppLink
                    route="/app/[publicApiKey]/edit/"
                    param:publicApiKey={data.value.app.publicApiKey}
                  >
                    <SymbolIcon /> Edit
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    route="/app/[publicApiKey]/symbols/"
                    param:publicApiKey={data.value.app.publicApiKey}
                  >
                    <SymbolIcon /> Symbols View
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    route="/app/[publicApiKey]/symbols/edge/"
                    param:publicApiKey={data.value.app.publicApiKey}
                  >
                    <SymbolIcon /> Edge View
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    route="/app/[publicApiKey]/symbols/bundles/"
                    param:publicApiKey={data.value.app.publicApiKey}
                  >
                    <SymbolIcon /> Bundles View
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    route="/app/[publicApiKey]/symbols/slow/"
                    param:publicApiKey={data.value.app.publicApiKey}
                  >
                    <SlowIcon /> Slow Symbols View
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    route="/app/[publicApiKey]/errors/"
                    param:publicApiKey={data.value.app.publicApiKey}
                  >
                    <ErrorIcon /> Errors View
                  </AppLink>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
});
