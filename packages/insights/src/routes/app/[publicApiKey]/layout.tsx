import { Slot, component$ } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';
import Layout from '~/components/layout';
import styles from './styles.module.css';
import { EditIcon } from '~/components/icons/edit';

export default component$(() => {
  return (
    <Layout class={styles['no-padding-left']}>
      <div class={styles.container}>
        <aside class={styles.aside}>
          <div class={styles.menu}>
            <Link href="./edit" class={[styles['menu-item'], ]}>
              <EditIcon />
              <span class={styles['menu-item-label']}>Edit</span>
            </Link>
            <Link href="./symbols" class={[styles['menu-item'], styles.active]}>
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
            <Link href="./errors" class={styles['menu-item']}>
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
