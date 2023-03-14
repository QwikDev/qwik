import { component$, $, useStylesScoped$ } from '@builder.io/qwik';
import styles from './hero.css?inline';

export default component$(() => {
  useStylesScoped$(styles);
  return (
    <div class="hero">
      <h1>Welcome to qwik</h1>
      <button
        onClick$={() => {
          party();
        }}
      >
        Time to celebrate 🎉
      </button>
    </div>
  );
});

export const party = $(() => {
  const defaults = {
    spread: 360,
    ticks: 70,
    gravity: 0,
    decay: 0.95,
    startVelocity: 30,
    colors: ['006ce9', 'ac7ff4', '18b6f6', '713fc2', 'ffffff'],
    origin: {
      x: 0.5,
      y: 0.245,
    },
  };

  function shoot() {
    // @ts-ignore
    confetti({
      ...defaults,
      particleCount: 80,
      scalar: 1.2,
    });

    // @ts-ignore
    confetti({
      ...defaults,
      particleCount: 60,
      scalar: 0.75,
    });
  }

  setTimeout(shoot, 0);
  setTimeout(shoot, 100);
  setTimeout(shoot, 200);
  setTimeout(shoot, 300);
  setTimeout(shoot, 400);
});
