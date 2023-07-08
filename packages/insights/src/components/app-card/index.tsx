import { $, Slot, component$ } from '@builder.io/qwik';

import { AppLink } from '~/routes.config';
import { CopyIcon } from '../icons/copy';
import Gauge from '../gauge';
import styles from './styles.module.css';

type AppCardProps = {
  mode: 'show' | 'edit' | 'new' | 'create';
  title?: string;
  publicApiKey?: string;
  description?: string | null;
};

export default component$<AppCardProps>(
  ({ mode, title = '', publicApiKey = '__new__', description }) => {
    const link = mode === 'show' ? `/app/[publicApiKey]/` : `/app/[publicApiKey]/edit/`;
    const label = mode === 'create' ? '+' : title.substring(0, 2).toUpperCase();
    const gaugeColor = mode === 'create' ? 'gray' : 'default';

    const appCard = (
      <div class={[styles.card, `${mode === 'create' || mode === 'show' ? styles.pointer : ''}`]}>
        <div class={styles.wrapper}>
          <div class={styles['gauge-wrapper']}>
            <Gauge radius={40} value={70} label={label} color={gaugeColor} />
          </div>
          <div>
            {mode === 'show' ? (
              <>
                <div class={[styles.title, 'h6']}>{title}</div>
                <div class={styles['api-key']}>
                  Token: {publicApiKey}
                  <CopyIcon
                    class={styles['copy-icon']}
                    onClick$={$(() => {
                      navigator.clipboard.writeText(publicApiKey);
                    })}
                  />
                </div>
                {description && <div class={[styles.description]}>{description}</div>}
              </>
            ) : mode === 'create' ? (
              <div class={[styles.title, 'h6']}>{title}</div>
            ) : mode === 'new' ? (
              <div class={[styles.title, 'h6']}>{title}</div>
            ) : (
              <Slot />
            )}
          </div>
        </div>
      </div>
    );

    return mode === 'create' || mode === 'show' ? (
      <AppLink route={link} param:publicApiKey={publicApiKey}>
        {appCard}
      </AppLink>
    ) : (
      appCard
    );
  }
);
