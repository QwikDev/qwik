import { component$ } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';
import { useAuthSession, useAuthSignout } from '~/routes/plugin@auth';
import Avatar from '../avatar';
import { QwikIcon } from '../icons/qwik';
import styles from './styles.module.css';

export default component$(() => {
  const signOutSig = useAuthSignout();
  const userCtx = useAuthSession();

  return (
    <header>
      <Link href="/app/" class={styles.logo}>
        <QwikIcon width="46" height="50" />
      </Link>
      <span class={styles.title}>Insights</span>

      {userCtx.value?.user?.email && (
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
            <Avatar
              src={userCtx.value.user.image || ''}
              alt={userCtx.value.user.name || ''}
              size="small"
            />
          </div>
        </div>
      )}
    </header>
  );
});
