import { component$ } from '@builder.io/qwik';

type GaugeProps = {
  value?: number;
  label?: string;
  radius?: number;
  color?: 'default' | 'gray';
};

export const getLabel = (title: string) => title.substring(0, 2).toUpperCase();

export default component$<GaugeProps>(
  ({ value = 50, radius = 120, label = `${value}`, color = 'default' }) => {
    const GRADIENT_ID = `svg-gauge-gradient-${Math.floor(Math.random() * 10000)}`;

    const safeValue = value < 0 || value > 100 ? 50 : value;
    const safeLabel = label.length > 2 ? getLabel(label) : label;
    const progressBorderWidth = radius / 6;
    const startColor = color === 'default' ? '#18B6F6' : '#BDBDBD';
    const stopColor = color === 'default' ? '#AC7FF4' : '#BDBDBD';

    return (
      <div class="relative" style={{ width: `${radius * 2}px`, height: `${radius * 2}px` }}>
        <svg viewBox={`0 0 ${radius * 2} ${radius * 2}`}>
          <defs>
            <linearGradient id={GRADIENT_ID} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color={startColor} />
              <stop offset="1000%" stop-color={stopColor} />
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
            }, 351.858; fill:none; transform-origin:50% 50%; stroke-linecap:round; stroke:url(#${GRADIENT_ID})`}
          ></circle>
        </svg>
        <span
          class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-white"
          style={{ fontSize: `${radius / 24}rem` }}
        >
          {safeLabel}
        </span>
      </div>
    );
  }
);
