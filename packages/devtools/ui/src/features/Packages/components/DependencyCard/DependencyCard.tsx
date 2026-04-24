import { component$, $ } from '@qwik.dev/core';
import { Package } from '../../types';
import { PackageIcon } from '../PackageIcon';

export const DependencyCard = component$(({ pkg }: { pkg: Package }) => {
  const author = pkg.author;
  const authorName = typeof author === 'string' ? author.trim() : (author?.name || '').trim();
  const authorDisplayName = authorName || 'Unknown';
  const authorInitials =
    authorDisplayName
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase() || '??';

  const handleAuthorClick = $(() => {
    if (typeof author !== 'string') {
      if (author?.url) {
        window.open(author.url, '_blank');
      } else if (author?.email) {
        window.open(`mailto:${author.email}`, '_blank');
      }
    }
  });

  const handlePackageClick = $(() => {
    if (pkg.npmUrl) {
      window.open(pkg.npmUrl, '_blank');
    }
  });

  const handleHomepageClick = $(() => {
    if (pkg.homepage) {
      window.open(pkg.homepage, '_blank');
    }
  });

  const handleRepositoryClick = $(() => {
    if (pkg.repository) {
      window.open(pkg.repository, '_blank');
    }
  });

  return (
    <div class="bg-card-item-bg border-glass-border hover:border-primary/30 hover:shadow-primary/5 group relative rounded-xl border p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
      {/* Subtle gradient background on hover */}
      <div class="from-primary/0 via-primary/0 to-primary/5 pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div class="relative flex flex-col gap-4">
        {/* Header with package name and version */}
        <div class="flex items-start gap-4">
          {/* Package Avatar */}
          <div
            class="from-primary/10 via-primary/20 to-primary/30 border-primary/20 group-hover:shadow-primary/20 flex h-12 w-12 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border bg-gradient-to-br shadow-md transition-all duration-300 hover:scale-110 hover:rotate-3"
            onClick$={handlePackageClick}
            title={`View ${pkg.name} on npm`}
          >
            <PackageIcon packageName={pkg.name} iconUrl={pkg.iconUrl} />
          </div>

          <div class="min-w-0 flex-1">
            <h3
              class="text-foreground hover:text-primary mb-1.5 cursor-pointer truncate text-base font-bold transition-colors"
              onClick$={handlePackageClick}
              title={pkg.name}
            >
              {pkg.name}
            </h3>
            <span class="bg-primary/10 border-primary/20 text-primary inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium">
              <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
              v{pkg.version}
            </span>
          </div>
        </div>

        {/* Description */}
        <p class="text-muted-foreground line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed">
          {pkg.description || 'No description available'}
        </p>

        {/* Divider */}
        <div class="border-border border-t" />

        {/* Footer with author and links */}
        <div class="flex items-center justify-between gap-3">
          {/* Author Information */}
          {author ? (
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <div
                class="from-accent/20 to-accent/40 border-accent/30 flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border bg-gradient-to-br transition-transform hover:scale-110"
                onClick$={handleAuthorClick}
                title={`Contact ${authorDisplayName}`}
              >
                <span class="text-accent text-[10px] font-semibold">{authorInitials}</span>
              </div>
              <span class="text-muted-foreground truncate text-xs">
                <span class="text-foreground font-medium">{authorDisplayName}</span>
              </span>
            </div>
          ) : (
            <div class="flex-1" />
          )}

          {/* Action Links */}
          <div class="flex items-center gap-1.5">
            {pkg.homepage && (
              <button
                onClick$={handleHomepageClick}
                class="hover:bg-primary/10 group/btn text-muted-foreground hover:text-primary rounded-lg p-1.5 transition-all duration-200"
                title="Homepage"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </button>
            )}
            {pkg.repository && (
              <button
                onClick$={handleRepositoryClick}
                class="hover:bg-primary/10 group/btn text-muted-foreground hover:text-primary rounded-lg p-1.5 transition-all duration-200"
                title="Repository"
              >
                <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </button>
            )}
            {pkg.npmUrl && (
              <button
                onClick$={handlePackageClick}
                class="hover:bg-primary/10 group/btn text-muted-foreground hover:text-primary rounded-lg p-1.5 transition-all duration-200"
                title="npm"
              >
                <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331zM10.665 10H12v2.667h-1.335V10z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
