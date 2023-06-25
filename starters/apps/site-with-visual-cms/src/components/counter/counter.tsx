import { component$, useSignal, $ } from "@builder.io/qwik";
import styles from "./counter.module.css";
import Gauge from "../gauge";

export default component$((props: { initialValue: number }) => {
  const count = useSignal(props.initialValue || 99);

  const setCount = $((newValue: number) => {
    if (newValue >= 0 && newValue <= 100) {
      count.value = newValue;

      if (newValue === 100) {
        celebrate();
      }
    }
  });

  return (
    <div class={styles.wrapper}>
      <button class={styles.button} onClick$={() => setCount(count.value - 1)}>
        -
      </button>
      <Gauge value={count.value} />
      <button class={styles.button} onClick$={() => setCount(count.value + 1)}>
        +
      </button>
    </div>
  );
});

export const celebrate = $(async () => {
  const defaults = {
    spread: 360,
    ticks: 70,
    gravity: 0,
    decay: 0.95,
    startVelocity: 30,
    colors: ["006ce9", "ac7ff4", "18b6f6", "713fc2", "ffffff"],
    origin: {
      x: 0.5,
      y: 0.35,
    },
  };

  function loadConfetti() {
    return new Promise<(opts: any) => void>((resolve, reject) => {
      if ((globalThis as any).confetti) {
        return resolve((globalThis as any).confetti as any);
      }
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/canvas-confetti@1.5.1/dist/confetti.browser.min.js";
      script.onload = () => resolve((globalThis as any).confetti as any);
      script.onerror = reject;
      document.head.appendChild(script);
      script.remove();
    });
  }

  const confetti = await loadConfetti();

  function shoot() {
    confetti({
      ...defaults,
      particleCount: 80,
      scalar: 1.2,
    });

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
