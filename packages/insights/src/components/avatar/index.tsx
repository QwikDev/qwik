import { component$ } from '@builder.io/qwik';
import styles from './styles.module.css';

type AvatarProps = {
  src: string;
  alt: string;
  size?: 'small' | 'medium' | 'large';
};

/**
 * todos:
 * - implement sizes
 * - add a link to open the menu
 */

export default component$<AvatarProps>((props) => {
  return <img src={props.src} alt={props.alt} class={styles.avatar} width="40" height="40" />;
});
