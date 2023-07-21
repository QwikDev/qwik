import { Link, useLocation } from '@builder.io/qwik-city';
import { Slot, component$ } from '@builder.io/qwik';

import { EditIcon } from '~/components/icons/edit';
import Layout from '~/components/layout';
import styles from './styles.module.css';
import { SymbolIcon } from '~/components/icons/symbol';
import { EdgeIcon } from '~/components/icons/edge';
import { BundleIcon } from '~/components/icons/bundle';
import { SlowIcon } from '~/components/icons/slow';
import { ErrorIcon } from '~/components/icons/error';
import { DashboardIcon } from '~/components/icons/dashboard';
import { ManifestIcon } from '~/components/icons/manifest';
import { AppLink } from '~/routes.config';

export default component$(() => {
  const location = useLocation();
  const path = `/app/${location.params.publicApiKey}/`;
  const subPath = location.url.pathname.replace(path, '');
  return (
    <Layout class={styles['no-padding-left']}>
      <div class={styles.container}>
        <aside class={styles.aside}>
          <div class={styles.menu}>
            {/* TODO: render this in a loop */}
            <Link href={path} class={[styles['menu-item'], subPath === '' ? styles.active : '']}>
              <DashboardIcon />
              <span>Dashboard</span>
            </Link>
            <Link
              href={path + 'edit/'}
              class={[styles['menu-item'], subPath === 'edit/' ? styles.active : '']}
            >
              <EditIcon />
              <span>Edit</span>
            </Link>
            <AppLink
              route={'/app/[publicApiKey]/manifests/'}
              param:publicApiKey={location.params.publicApiKey}
              class={[styles['menu-item'], subPath === 'manifests/' ? styles.active : '']}
            >
              <ManifestIcon />
              <span>Manifests</span>
            </AppLink>
            <Link
              href={path + 'symbols/'}
              class={[styles['menu-item'], subPath === 'symbols/' ? styles.active : '']}
            >
              <SymbolIcon />
              <span>Symbols</span>
            </Link>
            <Link
              href={path + 'symbols/edge/'}
              class={[styles['menu-item'], subPath === 'symbols/edge/' ? styles.active : '']}
            >
              <EdgeIcon />
              <span>Edge</span>
            </Link>
            <Link
              href={path + 'symbols/bundles/'}
              class={[styles['menu-item'], subPath === 'symbols/bundles/' ? styles.active : '']}
            >
              <BundleIcon />
              <span>Bundles</span>
            </Link>
            <Link
              href={path + 'symbols/slow/'}
              class={[styles['menu-item'], subPath === 'symbols/slow/' ? styles.active : '']}
            >
              <SlowIcon />
              <span>Slow Symbols</span>
            </Link>
            <Link
              href={path + 'errors/'}
              class={[styles['menu-item'], subPath === 'errors/' ? styles.active : '']}
            >
              <ErrorIcon />
              <span>Errors</span>
            </Link>
          </div>
        </aside>
        <div class={styles.wrapper}>
          <Slot />
        </div>
      </div>
    </Layout>
  );
});
