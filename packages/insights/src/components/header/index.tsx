import { component$, useContext } from '@builder.io/qwik';

import Avatar from '../avatar';
import { Link } from '@builder.io/qwik-city';
import { QwikIcon } from '../icons/qwik';
import { UserContext } from '~/context/user';
import styles from './styles.module.css';
import { useAuthSignout } from '~/routes/plugin@auth';

export default component$(() => {
  const signOutSig = useAuthSignout();
  const userCtx = useContext(UserContext);

  return (
    <header>
      <Link href="/" class={styles.logo}>
        <QwikIcon width="46" height="50" />
      </Link>
      <span class={styles.title}>Insights</span>

      {userCtx.value?.email && (
        <div class={styles.user_section}>
          <Link class={styles.link} href="/">
            Setting
          </Link>
          <Link
            class={styles.link}
            onClick$={() => {
              signOutSig.submit({ callbackUrl: '/' });
            }}
          >
            Logout
          </Link>
          <div class={styles.avatar}>
            <Avatar src={userCtx.value.image || ''} alt={userCtx.value.name || ''} size="small" />
          </div>
        </div>
      )}
    </header>
  );
});
