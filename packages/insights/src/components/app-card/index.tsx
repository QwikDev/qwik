import Gauge from '../gauge';
import { $, component$ } from '@builder.io/qwik';
import styles from './styles.module.css';
import { CopyIcon } from '../icons/copy';

type AppCardProps = {
  title: string;
  publicApiKey?: string;
  description?: string | null;
};

export default component$<AppCardProps>(({ title, publicApiKey = '__new__', description }) => {
  const isExistingApp = publicApiKey !== '__new__';
  const link = isExistingApp ? `/app/[publicApiKey]/` : `/app/[publicApiKey]/edit/`;
  const label = isExistingApp ? title.substring(0, 2).toUpperCase() : '+';
  const gaugeColor = isExistingApp ? 'default' : 'gray';

  return (
    // <AppLink route={link} param:publicApiKey={publicApiKey}>
    <div class={styles.wrapper}>
      <div class={styles['gauge-wrapper']}>
        <Gauge radius={40} value={70} label={label} color={gaugeColor} />
      </div>
      <div>
        <div class={[styles.title, 'h5']}>{title}</div>
        {isExistingApp && (
          <div class={styles['api-key']}>
            API-Key: {publicApiKey}{' '}
            <CopyIcon
              class={styles['copy-icon']}
              onClick$={$(() => {
                navigator.clipboard.writeText(publicApiKey);
              })}
            />
          </div>
        )}
        {description && <div class={[styles.description]}>{description}</div>}
      </div>
    </div>
    // </AppLink>
  );
});
