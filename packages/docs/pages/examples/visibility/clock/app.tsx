import { component$, useStore, useStyles$, useClientEffect$ } from '@builder.io/qwik';
import styles from './clock.css';

export const App = component$(() => {
  const items = new Array(40).fill(null).map((_, index) => 'item ' + index);

  return (
    <div>
      <p>This is an example of Lazy executing code on component when component becomes visible.</p>

      <p>
        ⬇️ <strong>Scroll down</strong> until the clock is in view.
      </p>

      <ul>
        {items.map((i) => (
          <li>{i}</li>
        ))}
      </ul>

      <Clock />
    </div>
  );
});

export const Clock = component$(() => {
  useStyles$(styles);

  const store = useStore({
    hour: 10,
    minute: 20,
    second: 30,
  });

  useClientEffect$(() => {
    const tmrId = setInterval(() => {
      const now = new Date();
      store.second = (now.getSeconds() * 60) / 360;
      store.minute = (now.getMinutes() * 60) / 360;
      store.hour = (now.getHours() * 60) / 360;
    }, 1000);
    return () => clearInterval(tmrId);
  });

  return (
    <div class="clock">
      <div class="twelve"></div>
      <div class="three"></div>
      <div class="six"></div>
      <div class="nine"></div>
      <div class="hour" style={{ transform: `rotate(${store.hour}deg)` }}></div>
      <div class="minute" style={{ transform: `rotate(${store.minute}deg)` }}></div>
      <div class="second" style={{ transform: `rotate(${store.second}deg)` }}></div>
    </div>
  );
});
