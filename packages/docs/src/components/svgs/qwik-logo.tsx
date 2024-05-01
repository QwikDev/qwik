import { component$ } from '@builder.io/qwik';
import uwu from './uwu?raw';

interface QwikLogoProps {
  width: number;
  height: number;
}

export const QwikLogo = component$((props: QwikLogoProps) => {
  return (
    <>
      <img
        id="qwik-logo"
        width={props.width}
        height={props.height}
        alt="Qwik Logo"
        class="qwik-logo"
      />
      <script dangerouslySetInnerHTML={uwu}></script>
    </>
  );
});
