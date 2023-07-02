import Avatar from '../avatar';
import { Link } from '@builder.io/qwik-city';
import { QwikIcon } from '../icons/qwik';
import { component$ } from '@builder.io/qwik';
import styles from './styles.module.css';

// import { paths } from "~/routes/layout";

export default component$(() => {
  return (
    <header class="section">
      <Link href="/" class={styles.logo}>
        <QwikIcon width="46" height="50" />
      </Link>
      <span class={styles.title}>Insights</span>
      <span class={styles.avatar}>
        <Avatar
          src="https://avatars.githubusercontent.com/u/3241476?v=4"
          alt="Roman Zanettin"
          size="small"
        />
      </span>
    </header>
  );
});
