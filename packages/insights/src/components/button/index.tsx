import styles from './styles.module.css';

import { type QwikIntrinsicElements, Slot, component$ } from '@builder.io/qwik';

type ButtonProps = QwikIntrinsicElements['button'] & {
  theme?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'info' | 'github';
  size?: 'small' | 'medium' | 'large';
  variant?: 'outlined' | 'contained';
};

/**
 * todos:
 * - implement sizes
 * - implement themes
 * - implement variants
 */

export default component$<ButtonProps>((props) => {
  return (
    <button {...props} class={['button', props.theme === 'github' && styles.github]}>
      <Slot />
    </button>
  );
});
