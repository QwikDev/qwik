import { AppLink } from '~/routes.config';
import Gauge from '../gauge';
import { component$ } from '@builder.io/qwik';
import styles from './styles.module.css';

type AppCardProps = {
  mode: 'show' | 'create';
  title?: string;
  publicApiKey?: string;
  description?: string | null;
};

export default component$<AppCardProps>(
  ({ mode, title = '', publicApiKey = '__new__', description }) => {
    const link = mode === 'show' ? `/app/[publicApiKey]/` : `/app/add/`;
    const label = mode === 'create' ? '+' : title;
    const gaugeColor = mode === 'create' ? 'gray' : 'default';

    return (
      <AppLink route={link} param:publicApiKey={publicApiKey}>
        <div class={[styles.card, styles.pointer]}>
          <div class={styles.wrapper}>
            <div class={styles['gauge-wrapper']}>
              <Gauge radius={40} value={70} label={label} color={gaugeColor} />
            </div>
            <div>
              {mode === 'show' ? (
                <>
                  <div class={[styles.title, 'h6']}>{title}</div>
                  <div class={styles['api-key']}>Token: {publicApiKey}</div>
                  {description && <div class={[styles.description]}>{description}</div>}
                </>
              ) : (
                <div class={[styles.title, 'h6']}>{title}</div>
              )}
            </div>
          </div>
        </div>
      </AppLink>
    );
  }
);
