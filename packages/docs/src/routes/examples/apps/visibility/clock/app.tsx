import { component$, useStore, useStyles$, useVisibleTask$ } from '@builder.io/qwik';
import styles from './clock.css';

export default component$(() => {
  const items = new Array(60).fill(null).map((_, index) => 'item ' + index);

  console.log('PARENT');
  return (
    <div>
      <p onClick$={() => console.log('test')}>
        This is an example of Lazy executing code on component when component becomes visible.
      </p>

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
    hour: {},
    minute: {},
    second: {},
  });

  useVisibleTask$(() => {
    const getStyle = (deg: number) => ({ transform: `rotate(${deg}deg)` });
    const update = () => {
      const now = new Date();
      store.second = getStyle(now.getSeconds() * (360 / 60));
      store.minute = getStyle(now.getMinutes() * (360 / 60));
      store.hour = getStyle(now.getHours() * (360 / 12));
    };
    update();
    const tmrId = setInterval(update, 1000);
    return () => clearInterval(tmrId);
  });

  console.log('Render Clock');
  return (
    <div class="clock">
      <div class="twelve"></div>
      <div class="three"></div>
      <div class="six"></div>
      <div class="nine"></div>
      <div class="hour" style={store.hour}></div>
      <div class="minute" style={store.minute}></div>
      <div class="second" style={store.second}></div>
    </div>
  );
});
