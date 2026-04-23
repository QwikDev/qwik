import { component$, useSignal, $ } from '@qwik.dev/core';

interface PackageIconProps {
  packageName: string;
  iconUrl?: string | null;
}

export const PackageIcon = component$(
  ({ packageName, iconUrl }: PackageIconProps) => {
    const iconError = useSignal(false);

    const handleIconError = $(() => {
      iconError.value = true;
    });

    const fallbackInitial =
      packageName.split('/').pop()?.charAt(0).toUpperCase() ||
      packageName.charAt(0).toUpperCase();

    // Show fallback if no icon URL or icon failed to load
    if (!iconUrl || iconError.value) {
      return (
        <span class="text-primary text-sm font-bold">{fallbackInitial}</span>
      );
    }

    return (
      <img
        src={iconUrl}
        alt={`${packageName} icon`}
        class="h-6 w-6 rounded"
        width="24"
        height="24"
        onError$={handleIconError}
        loading="lazy"
      />
    );
  },
);
