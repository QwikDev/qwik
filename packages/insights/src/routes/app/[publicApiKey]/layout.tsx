import { Slot, component$ } from '@builder.io/qwik';
import { Link, useLocation } from '@builder.io/qwik-city';
import Layout from '~/components/layout';
import styles from './styles.module.css';
import { EditIcon } from '~/components/icons/edit';

export default component$(() => {
  const location = useLocation();
  const path = `/app/${location.params.publicApiKey}/`;
  const subPath = location.url.pathname.replace(path, '');
  return (
    <Layout class={styles['no-padding-left']}>
      <div class={styles.container}>
        <aside class={styles.aside}>
          <div class={styles.menu}>
            <Link href={path} class={[styles['menu-item'], subPath === '' ? styles.active : '']}>
              <EditIcon />
              <span class={styles['menu-item-label']}>Dashboard</span>
            </Link>
            <Link
              href={path + 'edit/'}
              class={[styles['menu-item'], subPath === 'edit/' ? styles.active : '']}
            >
              <EditIcon />
              <span class={styles['menu-item-label']}>Edit</span>
            </Link>
            <Link
              href={path + 'symbols/'}
              class={[styles['menu-item'], subPath === 'symbols/' ? styles.active : '']}
            >
              <EditIcon />
              <span class={styles['menu-item-label']}>Symbols</span>
            </Link>
            <Link
              href={path + 'symbols/edge/'}
              class={[styles['menu-item'], subPath === 'symbols/edge/' ? styles.active : '']}
            >
              <EditIcon />
              <span class={styles['menu-item-label']}>Edge</span>
            </Link>
            <Link
              href={path + 'symbols/bundles/'}
              class={[styles['menu-item'], subPath === 'symbols/bundles/' ? styles.active : '']}
            >
              <EditIcon />
              <span class={styles['menu-item-label']}>Bundles</span>
            </Link>
            <Link
              href={path + 'symbols/slow/'}
              class={[styles['menu-item'], subPath === 'symbols/slow/' ? styles.active : '']}
            >
              <EditIcon />
              <span class={styles['menu-item-label']}>Slow Symbols</span>
            </Link>
            <Link
              href={path + 'errors/'}
              class={[styles['menu-item'], subPath === 'errors/' ? styles.active : '']}
            >
              <EditIcon />
              <span class={styles['menu-item-label']}>Errors</span>
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
