import { Link, globalAction$ } from '@builder.io/qwik-city';
import { component$, useContext } from '@builder.io/qwik';

import Avatar from '../avatar';
import { QwikIcon } from '../icons/qwik';
import { UserContext } from '~/context/user';
import { removeAuthCookies } from '~/supabase/auth/auth';
import styles from './styles.module.css';

export const useSingOut = globalAction$(async (_, event) => {
  removeAuthCookies(event);
});

export default component$(() => {
  const singOut = useSingOut();
  const userCtx = useContext(UserContext);

  return (
    <header>
      <Link href="/" class={styles.logo}>
        <QwikIcon width="46" height="50" />
      </Link>
      <span class={styles.title}>Insights</span>

      {userCtx.value?.id && (
        <div class={styles.user_section}>
          <Link class={styles.link} href="/">
            Setting
          </Link>
          <Link
            class={styles.link}
            onClick$={() => {
              singOut.submit();
            }}
          >
            Logout
          </Link>
          <div class={styles.avatar}>
            <Avatar
              src={userCtx.value.user_metadata.avatar_url || ''}
              alt={userCtx.value.user_metadata.user_name || ''}
              size="small"
            />
          </div>
        </div>
      )}
    </header>
  );
});
