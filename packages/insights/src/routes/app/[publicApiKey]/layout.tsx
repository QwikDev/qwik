import { Link, useLocation } from '@builder.io/qwik-city';
import { Slot, component$ } from '@builder.io/qwik';

import { EditIcon } from '~/components/icons/edit';
import Layout from '~/components/layout';
import styles from './styles.module.css';

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
              <EditIcon />
              <span>Dashboard</span>
            </Link>
            <Link
              href={path + 'edit/'}
              class={[styles['menu-item'], subPath === 'edit/' ? styles.active : '']}
            >
              <EditIcon />
              <span>Edit</span>
            </Link>
            <Link
              href={path + 'symbols/'}
              class={[styles['menu-item'], subPath === 'symbols/' ? styles.active : '']}
            >
              <EditIcon />
              <span>Symbols</span>
            </Link>
            <Link
              href={path + 'symbols/edge/'}
              class={[styles['menu-item'], subPath === 'symbols/edge/' ? styles.active : '']}
            >
              <EditIcon />
              <span>Edge</span>
            </Link>
            <Link
              href={path + 'symbols/bundles/'}
              class={[styles['menu-item'], subPath === 'symbols/bundles/' ? styles.active : '']}
            >
              <EditIcon />
              <span>Bundles</span>
            </Link>
            <Link
              href={path + 'symbols/slow/'}
              class={[styles['menu-item'], subPath === 'symbols/slow/' ? styles.active : '']}
            >
              <EditIcon />
              <span>Slow Symbols</span>
            </Link>
            <Link
              href={path + 'errors/'}
              class={[styles['menu-item'], subPath === 'errors/' ? styles.active : '']}
            >
              <EditIcon />
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
