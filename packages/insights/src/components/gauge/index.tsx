import { component$ } from '@builder.io/qwik';
import styles from './gauge.module.css';

type GaugeProps = {
  value?: number;
  label?: string;
  radius?: number;
};

export default component$<GaugeProps>(({ value = 50, radius = 120, label = value }) => {
  const safeValue = value < 0 || value > 100 ? 50 : value;

  const progressBorderWidth = Math.min(radius / 5, 26);

  return (
    <div class={styles.wrapper} style={{ width: `${radius * 2}px`, height: `${radius * 2}px` }}>
      <svg viewBox={`0 0 ${radius * 2} ${radius * 2}`} class={styles.gauge}>
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#18B6F6" />
            <stop offset="1000%" stop-color="#AC7FF4" />
          </linearGradient>
        </defs>

        <circle
          r={radius - progressBorderWidth / 2}
          cx={radius}
          cy={radius}
          stroke-width={progressBorderWidth}
          style="fill: #000; stroke: #0000"
        ></circle>

        <circle
          r={radius - progressBorderWidth / 2}
          cx={radius}
          cy={radius}
          stroke-width={progressBorderWidth}
          style={`transform: rotate(-87.9537deg); stroke-dasharray: ${
            (safeValue * 3.51 * radius) / 60
          }, 351.858; fill:none; transform-origin:50% 50%; stroke-linecap:round; stroke:url(#gradient)`}
        ></circle>
      </svg>
      <span class={styles.value} style={{ fontSize: `${radius / 24}rem` }}>
        {label}
      </span>
    </div>
  );
});
