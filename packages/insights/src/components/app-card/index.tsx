import { AppLink } from '~/routes.config';
import { CopyIcon } from '../icons/copy';
import Gauge from '../gauge';
import { component$ } from '@builder.io/qwik';

type AppCardProps = {
  mode: 'show' | 'create' | 'link';
  title?: string;
  publicApiKey?: string;
  description?: string | null;
};

export default component$<AppCardProps>(({ mode, title = '', publicApiKey = '__new__' }) => {
  const link = mode === 'show' ? `/app/[publicApiKey]/` : `/app/add/`;
  const label = mode === 'create' ? '+' : mode === 'link' ? '~' : title;
  const gaugeColor = mode === 'show' ? 'default' : 'gray';

  return (
    <AppLink route={link} param:publicApiKey={publicApiKey}>
      <div class="cursor-pointer rounded-lg bg-white p-6">
        <div class="flex items-center gap-4">
          <div class="min-w-[80px]">
            <Gauge radius={40} value={70} label={label} color={gaugeColor} />
          </div>
          <div>
            {mode === 'show' ? (
              <>
                <div class="h6">{title}</div>
                <div class="flex gap-6 text-xs">
                  <span>Token: {publicApiKey}</span>
                  <CopyIcon
                    onClick$={() => {
                      navigator.clipboard.writeText(publicApiKey);
                    }}
                  />
                </div>
              </>
            ) : (
              <div class="h6">{title}</div>
            )}
          </div>
        </div>
      </div>
    </AppLink>
  );
});
