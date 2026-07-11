import { component$ } from '@qwik.dev/core';
import { Link, useLocation } from '@qwik.dev/router';
import { useSession, useSignOut } from '~/routes/plugin@auth';
import Avatar from '../avatar';
import { QwikIcon } from '../icons/qwik';
import { getSettingsHref } from './header-url';

export default component$(() => {
  const signOutSig = useSignOut();
  const userCtx = useSession();
  const settingsHref = getSettingsHref(useLocation().params.publicApiKey);

  return (
    <header class="flex items-center gap-3 border border-b-slate-200 px-6 py-3">
      <Link href="/app/">
        <QwikIcon width="46" height="50" />
      </Link>
      <span class="font-thin">Insights</span>

      {userCtx.value?.user?.email && (
        <div class="ml-auto flex items-center justify-center gap-8">
          {settingsHref && <Link href={settingsHref}>Settings</Link>}
          <Link
            class="cursor-pointer"
            onClick$={() => {
              signOutSig.submit({ redirectTo: '/' });
            }}
          >
            Logout
          </Link>
          <Avatar
            src={userCtx.value.user.image ?? ''}
            alt={userCtx.value.user.name ?? ''}
            size="small"
          />
        </div>
      )}
    </header>
  );
});
