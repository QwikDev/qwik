import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { QwikIcon } from '~/components/icons/qwik';

type ApplicationRowProps = {
  href: string;
  latestManifestHash?: string | null;
  latestManifestTimestamp?: Date | string | null;
  name: string;
  url?: string | null;
};

const formatApplicationUrl = (url?: string | null) => {
  if (!url) {
    return 'No URL configured';
  }
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
};

export const formatManifestAge = (timestamp: Date | string, now = Date.now()): string => {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const elapsedSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));

  if (elapsedSeconds < 60) {
    return 'Just now';
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} hr ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return `${elapsedDays} ${elapsedDays === 1 ? 'day' : 'days'} ago`;
  }

  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export default component$<ApplicationRowProps>(
  ({ href, latestManifestHash, latestManifestTimestamp, name, url }) => {
    const manifestDate = latestManifestTimestamp
      ? latestManifestTimestamp instanceof Date
        ? latestManifestTimestamp
        : new Date(latestManifestTimestamp)
      : null;

    return (
      <Link
        href={href}
        class="group flex min-h-32 flex-col gap-editorial-6 rounded-editorial-lg border border-editorial-border bg-editorial-surface p-editorial-6 transition-colors hover:bg-editorial-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-editorial-accent md:flex-row md:items-center"
      >
        <div class="flex min-w-0 flex-1 items-center gap-editorial-5">
          <QwikIcon class="h-10 w-10 shrink-0" aria-hidden="true" />
          <div class="min-w-0">
            <h2 class="truncate text-editorial-20 font-semibold tracking-[-0.01em] text-editorial-primary">
              {name}
            </h2>
            <p
              class={[
                'mt-editorial-2 truncate text-editorial-14',
                url ? 'text-editorial-link' : 'text-editorial-muted',
              ]}
            >
              {formatApplicationUrl(url)}
            </p>
          </div>
        </div>

        <div class="w-full shrink-0 md:w-[var(--container-editorial-manifest)]">
          <p class="text-editorial-11 font-semibold tracking-[0.02em] text-editorial-muted uppercase">
            Latest manifest
          </p>
          {latestManifestHash && manifestDate ? (
            <>
              <p class="mt-editorial-2 truncate font-editorial-mono text-editorial-12 text-editorial-primary">
                {latestManifestHash}
              </p>
              <time
                class="mt-editorial-2 block text-editorial-12 text-editorial-muted"
                dateTime={manifestDate.toISOString()}
                title={manifestDate.toLocaleString('en')}
              >
                {formatManifestAge(manifestDate)}
              </time>
            </>
          ) : (
            <p class="mt-editorial-2 text-editorial-12 text-editorial-muted">No manifests yet</p>
          )}
        </div>

        <span class="shrink-0 self-end text-editorial-14 font-semibold text-editorial-link group-hover:text-editorial-primary md:self-center">
          Open
        </span>
      </Link>
    );
  }
);
