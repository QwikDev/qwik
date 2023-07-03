import { component$, useContext } from '@builder.io/qwik';

import Avatar from '../avatar';
import { Link } from '@builder.io/qwik-city';
import { QwikIcon } from '../icons/qwik';
import { UserContext } from '~/context/user';
import styles from './styles.module.css';

export default component$(() => {
  const userCtx = useContext(UserContext);

  return (
    <header class="section">
      <Link href="/" class={styles.logo}>
        <QwikIcon width="46" height="50" />
      </Link>
      <span class={styles.title}>Insights</span>

      {userCtx.value?.id && (
        <span class={styles.avatar}>
          <Avatar
            src={userCtx.value.user_metadata.avatar_url || ''}
            alt={userCtx.value.user_metadata.user_name || ''}
            size="small"
          />
        </span>
      )}
    </header>
  );
});
