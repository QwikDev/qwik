import {
  component$,
  useSignal,
  useStyles$,
  useVisibleTask$,
} from '@qwik.dev/core';
import skyImage from './hero.webp';
import styles from './rc-hero.css?inline';

const HEIGHT = 1125;
const HORIZON = 620;
const GROUND_HEIGHT = HEIGHT - HORIZON;
const VANISHING_X = 1000;
const ROAD_HALF_WIDTH = 1064;
const LANE_OFFSET = 532;

const TOP_SPEED = 4.5;
const START_DELAY = 0.4;
const ACCELERATION_TIME = 1.6;
const QWIK_CAR_DISTANCE = 1 / 0.3;
const LIGHT_BAR_HEIGHT = 117;
const LIGHT_OFFSET = 202;

const SLOW_CAR_SPEED = 1.9;
const FIRST_SLOW_CAR_DISTANCE = 4.2;
const SLOW_CAR_SPACING = 3.4;

const NEAREST_DISTANCE = 0.6;
const FARTHEST_DISTANCE = 34;
const TRAIL_END_DISTANCE = 0.9;
const TRAIL_SAMPLES = 8;
const GRID_LINE_COUNT = 40;
const DASH_COUNT = 20;
const DASH_SPACING = 1.6;
const DASH_LENGTH = 0.7;
const CAR_POOL_SIZE = 12;
const REDUCED_MOTION_TIME = 7.55;

const screenY = (distance: number) => HORIZON + GROUND_HEIGHT / distance;
const laneX = (distance: number, side: number) =>
  VANISHING_X + (side * LANE_OFFSET) / distance;
const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const smoothstep = (value: number) => {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
};

const sparklePath = (x: number, y: number, radius: number) =>
  `M ${x} ${y - radius} Q ${x} ${y} ${x + radius} ${y} Q ${x} ${y} ${x} ${y + radius} Q ${x} ${y} ${x - radius} ${y} Q ${x} ${y} ${x} ${y - radius} Z`;

const SPARKLES = [
  [1993.5, 516.8, 7.1],
  [1297.5, 196.8, 6.3],
  [1321.7, 297.8, 7],
  [1446.6, 143.2, 5.1],
  [1533.9, 265.3, 18.7],
  [294.6, 301.1, 7],
  [1894.2, 42.5, 9.2],
  [1236.5, 124.9, 17.1],
  [733.5, 363.3, 11.4],
  [1777.8, 496.5, 17.6],
  [125, 353.3, 12],
  [1499.4, 117.2, 8.2],
  [1210.3, 200.8, 7.9],
  [1357.3, 129.8, 6.9],
  [759.2, 336.8, 5],
  [1803.3, 293.4, 5.1],
  [591, 331.4, 5.4],
  [1921.9, 133.6, 6.7],
  [521.2, 446.1, 8],
  [1672.5, 295.1, 7.3],
  [30.4, 365.1, 8.6],
  [1816.4, 416.4, 5.3],
  [631, 493.6, 21.4],
  [1389.4, 240.3, 21.7],
];

const DOTS = [
  [1425.9, 515.8, 2.1],
  [1434.9, 506.3, 1.6],
  [347.2, 21.8, 1.7],
  [316.6, 516.5, 1.8],
  [326, 187.2, 2.2],
  [231.1, 403.9, 1.6],
  [590.5, 126.6, 1.6],
  [361.8, 276.9, 2.2],
  [1897.3, 62, 2.1],
  [1490.7, 516.9, 1.6],
  [399.1, 438.3, 2.4],
  [1389, 29.5, 1.5],
  [230, 430.7, 1.6],
  [1211.1, 105.1, 1.5],
  [511.8, 314.1, 2.4],
  [85, 419, 1.6],
  [299.9, 306.9, 1.8],
  [1665.6, 382.5, 1.8],
  [1729.9, 164.6, 2.2],
  [99.7, 446.3, 2.4],
  [846.6, 142.5, 2.2],
  [1596.1, 384.2, 2.3],
  [413.8, 428, 2.2],
];

const NETWORK_CLUSTERS = [
  [
    [1442.9, 266.3],
    [1756.5, 83.7],
    [1431.9, 111.6],
    [1687.5, 185.5],
    [1365.7, 126.3],
    [1452, 120],
    [1417, 157.3],
    [1526.7, 118.6],
    [1742.1, 186.3],
  ],
  [
    [373.6, 424.2],
    [412.3, 428.9],
    [203, 492.1],
    [238.2, 370],
    [238, 442.8],
    [314.8, 475.3],
    [306.1, 449],
  ],
  [
    [1827.9, 383.4],
    [1910.8, 424.5],
    [1791.6, 488.4],
    [1711.5, 433.8],
    [1673.4, 436.7],
    [1786, 412.1],
  ],
];

const pseudoRandom = (seed: number) => {
  const noise = Math.sin(seed * 12.9898) * 43758.5453;
  return noise - Math.floor(noise);
};

const twinkleTiming = (seed: number, shortest: number, longest: number) => {
  const duration = shortest + (longest - shortest) * pseudoRandom(seed);
  return {
    animationDuration: `${duration.toFixed(2)}s`,
    animationDelay: `${(-duration * pseudoRandom(seed + 0.5)).toFixed(2)}s`,
  };
};

const distanceTravelled = (time: number) => {
  const drivingTime = time - START_DELAY;
  if (drivingTime <= 0) {
    return 0;
  }
  if (drivingTime >= ACCELERATION_TIME) {
    return TOP_SPEED * (drivingTime - ACCELERATION_TIME / 2);
  }
  const progress = drivingTime / ACCELERATION_TIME;
  return TOP_SPEED * ACCELERATION_TIME * (progress ** 3 - progress ** 4 / 2);
};

const slowCarDistances = (time: number) => {
  const shift = SLOW_CAR_SPEED * time - distanceTravelled(time);
  const firstVisibleCar = Math.max(
    0,
    Math.ceil(
      (NEAREST_DISTANCE - FIRST_SLOW_CAR_DISTANCE - shift) / SLOW_CAR_SPACING
    )
  );
  const distances: number[] = [];
  for (
    let car = firstVisibleCar;
    FIRST_SLOW_CAR_DISTANCE + car * SLOW_CAR_SPACING + shift <=
    FARTHEST_DISTANCE;
    car++
  ) {
    distances.push(FIRST_SLOW_CAR_DISTANCE + car * SLOW_CAR_SPACING + shift);
  }
  return distances.reverse();
};

const gridLine = (index: number, travelled: number) => {
  const distance = Math.max(index + 1 - (travelled % 1), 0.5);
  return {
    y: screenY(distance),
    strokeWidth: Math.max(0.6, 2.4 / distance),
    opacity: 0.2 + 0.5 / distance,
  };
};

const dashPoints = (index: number, travelled: number) => {
  const near = index * DASH_SPACING - (travelled % DASH_SPACING);
  const far = near + DASH_LENGTH;
  if (far <= NEAREST_DISTANCE) {
    return '';
  }
  const visibleNear = Math.max(near, NEAREST_DISTANCE);
  return [
    `${VANISHING_X - 7 / visibleNear},${screenY(visibleNear)}`,
    `${VANISHING_X + 7 / visibleNear},${screenY(visibleNear)}`,
    `${VANISHING_X + 7 / far},${screenY(far)}`,
    `${VANISHING_X - 7 / far},${screenY(far)}`,
  ].join(' ');
};

const hiddenCar = { transform: 'translate(0 2000)', opacity: 0 };

const slowCar = (distance: number) => ({
  transform: `translate(${laneX(distance, 1)} ${screenY(distance)}) scale(${1 / distance})`,
  opacity: clamp01((FARTHEST_DISTANCE - distance) / 6),
});

type TrailSample = {
  x: number;
  y: number;
  lightOffset: number;
  progress: number;
};

const trailSamples: TrailSample[] = Array.from(
  { length: TRAIL_SAMPLES + 1 },
  (_, index) => {
    const progress = index / TRAIL_SAMPLES;
    const distance =
      QWIK_CAR_DISTANCE - progress * (QWIK_CAR_DISTANCE - TRAIL_END_DISTANCE);
    return {
      x: laneX(distance, -1),
      y: screenY(distance) - (LIGHT_BAR_HEIGHT / distance) * (1 - progress),
      lightOffset: LIGHT_OFFSET / distance,
      progress,
    };
  }
);

const ribbon = (
  center: (sample: TrailSample) => number,
  halfWidth: (sample: TrailSample) => number
) =>
  [
    ...trailSamples.map(
      (sample) => `${center(sample) - halfWidth(sample)},${sample.y}`
    ),
    ...[...trailSamples]
      .reverse()
      .map((sample) => `${center(sample) + halfWidth(sample)},${sample.y}`),
  ].join(' ');

const beams = [1.15, 0.8].map((spread) =>
  ribbon(
    (sample) => sample.x,
    (sample) => sample.lightOffset * spread
  )
);

const TRAIL_LAYERS = [
  { fromHalfWidth: 3, toHalfWidth: 22, opacity: 0.3, white: false },
  { fromHalfWidth: 2, toHalfWidth: 10, opacity: 1, white: false },
  { fromHalfWidth: 0.7, toHalfWidth: 3, opacity: 0.9, white: true },
];

const trails = [-1, 1].flatMap((lightSide) =>
  TRAIL_LAYERS.map(({ fromHalfWidth, toHalfWidth, opacity, white }) => ({
    points: ribbon(
      (sample) => sample.x + lightSide * sample.lightOffset,
      (sample) =>
        fromHalfWidth + (toHalfWidth - fromHalfWidth) * sample.progress
    ),
    fill: white
      ? 'url(#rc-hero-trail-white)'
      : lightSide < 0
        ? 'url(#rc-hero-trail-blue)'
        : 'url(#rc-hero-trail-purple)',
    opacity,
  }))
);

const computeFrame = (time: number) => {
  const travelled = distanceTravelled(time);
  const distances = slowCarDistances(time);
  return {
    gridLines: Array.from({ length: GRID_LINE_COUNT }, (_, index) =>
      gridLine(index, travelled)
    ),
    dashes: Array.from({ length: DASH_COUNT }, (_, index) =>
      dashPoints(index, travelled)
    ),
    cars: Array.from({ length: CAR_POOL_SIZE }, (_, index) =>
      index < distances.length ? slowCar(distances[index]) : hiddenCar
    ),
    trailOpacity: smoothstep((time - START_DELAY) / ACCELERATION_TIME),
  };
};

const initialFrame = computeFrame(0);

export const RcHero = component$(() => {
  useStyles$(styles);
  const groundRef = useSignal<SVGSVGElement>();

  useVisibleTask$(({ cleanup }) => {
    const ground = groundRef.value;
    if (!ground) {
      return;
    }
    const select = <T extends Element>(selector: string) => [
      ...ground.querySelectorAll<T>(selector),
    ];
    const gridLines = select<SVGLineElement>('[data-grid-line]');
    const dashes = select<SVGPolygonElement>('[data-dash]');
    const cars = select<SVGUseElement>('[data-car]');
    const trailGroup = ground.querySelector<SVGGElement>('[data-trails]')!;

    const renderFrame = (time: number) => {
      const frame = computeFrame(time);
      gridLines.forEach((line, index) => {
        const { y, strokeWidth, opacity } = frame.gridLines[index];
        line.setAttribute('y1', String(y));
        line.setAttribute('y2', String(y));
        line.setAttribute('stroke-width', String(strokeWidth));
        line.setAttribute('opacity', String(opacity));
      });
      dashes.forEach((dash, index) =>
        dash.setAttribute('points', frame.dashes[index])
      );
      cars.forEach((car, index) => {
        car.setAttribute('transform', frame.cars[index].transform);
        car.setAttribute('opacity', String(frame.cars[index].opacity));
      });
      trailGroup.setAttribute('opacity', String(frame.trailOpacity));
    };

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      renderFrame(REDUCED_MOTION_TIME);
      return;
    }

    let elapsed = 0;
    let previousTimestamp: number | undefined;
    let frameRequest = 0;
    const tick = (timestamp: number) => {
      if (previousTimestamp !== undefined) {
        elapsed += Math.min((timestamp - previousTimestamp) / 1000, 0.05);
      }
      previousTimestamp = timestamp;
      renderFrame(elapsed);
      frameRequest = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !frameRequest) {
        previousTimestamp = undefined;
        frameRequest = requestAnimationFrame(tick);
      } else if (!entry.isIntersecting) {
        cancelAnimationFrame(frameRequest);
        frameRequest = 0;
      }
    });
    observer.observe(ground);
    cleanup(() => {
      cancelAnimationFrame(frameRequest);
      observer.disconnect();
    });
  });

  return (
    <div
      class="rc-hero"
      role="img"
      aria-label="A car with a Qwik light bar overtakes slower cars under a rising Qwik logo"
    >
      <img
        class="rc-hero-sky"
        src={skyImage}
        width={2000}
        height={1125}
        alt=""
        fetchPriority="high"
      />
      <svg class="rc-hero-stars" viewBox="0 0 2000 620" aria-hidden="true">
        <defs>
          <radialGradient id="rc-hero-star-glow">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.72" />
            <stop offset="0.3" stop-color="#d9e6ff" stop-opacity="0.32" />
            <stop offset="1" stop-color="#9fb8ff" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="rc-hero-node-glow">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.88" />
            <stop offset="0.35" stop-color="#18b6f6" stop-opacity="0.42" />
            <stop offset="1" stop-color="#18b6f6" stop-opacity="0" />
          </radialGradient>
        </defs>
        {DOTS.map(([x, y, radius], index) => (
          <circle
            key={`dot-${index}`}
            class="rc-hero-twinkle"
            style={twinkleTiming(index + 100, 1.6, 3.4)}
            cx={x}
            cy={y}
            r={radius * 3.5}
            fill="url(#rc-hero-star-glow)"
          />
        ))}
        {SPARKLES.map(([x, y, radius], index) => (
          <g
            key={`sparkle-${index}`}
            class="rc-hero-twinkle"
            style={twinkleTiming(index, 2, 4)}
          >
            <circle
              cx={x}
              cy={y}
              r={radius * 2.25}
              fill="url(#rc-hero-star-glow)"
            />
            <path
              d={sparklePath(x, y, radius * 1.08)}
              fill="#ffffff"
              opacity="0.85"
            />
          </g>
        ))}
        {NETWORK_CLUSTERS.flatMap((nodes, cluster) =>
          nodes.map(([x, y], index) => (
            <circle
              key={`node-${cluster}-${index}`}
              class="rc-hero-pulse"
              style={{
                animationDelay: `${(cluster * 1.4 + index * 0.3).toFixed(2)}s`,
              }}
              cx={x}
              cy={y}
              r="12"
              fill="url(#rc-hero-node-glow)"
            />
          ))
        )}
      </svg>
      <svg
        ref={groundRef}
        class="rc-hero-ground"
        viewBox="0 620 2000 505"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="rc-hero-ground-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#1a0b3d" />
            <stop offset="0.25" stop-color="#0c0624" />
            <stop offset="1" stop-color="#040211" />
          </linearGradient>
          <linearGradient id="rc-hero-road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#140a33" />
            <stop offset="1" stop-color="#07041a" />
          </linearGradient>
          <radialGradient id="rc-hero-reflection">
            <stop offset="0" stop-color="#ac7ef4" stop-opacity="0.45" />
            <stop offset="1" stop-color="#ac7ef4" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="rc-hero-horizon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ac7ef4" stop-opacity="0.45" />
            <stop offset="1" stop-color="#ac7ef4" stop-opacity="0" />
          </linearGradient>
          <radialGradient id="rc-hero-vignette" cx="0.5" cy="0.5" r="0.75">
            <stop offset="0.6" stop-color="#000000" stop-opacity="0" />
            <stop offset="1" stop-color="#000000" stop-opacity="0.55" />
          </radialGradient>
          <radialGradient id="rc-hero-taillight-glow">
            <stop offset="0" stop-color="#ff3b5c" stop-opacity="0.4" />
            <stop offset="1" stop-color="#ff3b5c" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="rc-hero-underglow">
            <stop offset="0" stop-color="#18b6f6" stop-opacity="0.6" />
            <stop offset="1" stop-color="#18b6f6" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="rc-hero-emblem-glow">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.6" />
            <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="rc-hero-light-bar" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#18b6f6" />
            <stop offset="1" stop-color="#ac7ef4" />
          </linearGradient>
          <linearGradient id="rc-hero-cabin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#3a2d86" />
            <stop offset="1" stop-color="#171038" />
          </linearGradient>
          {[
            ['rc-hero-trail-blue', '#18b6f6'],
            ['rc-hero-trail-purple', '#ac7ef4'],
            ['rc-hero-trail-white', '#ffffff'],
          ].map(([id, color]) => (
            <linearGradient
              key={id}
              id={id}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="1125"
              x2="0"
              y2="760"
            >
              <stop offset="0" stop-color={color} stop-opacity="0" />
              <stop offset="1" stop-color={color} stop-opacity="1" />
            </linearGradient>
          ))}
          <linearGradient
            id="rc-hero-beam"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="1125"
            x2="0"
            y2="760"
          >
            <stop offset="0" stop-color="#18b6f6" stop-opacity="0" />
            <stop offset="1" stop-color="#6f8cff" stop-opacity="0.3" />
          </linearGradient>
          <g id="rc-hero-car">
            <ellipse
              cx="0"
              cy="2"
              rx="260"
              ry="30"
              fill="url(#rc-hero-taillight-glow)"
            />
            <path d="M -143 -130 Q 0 -221 143 -130 Z" fill="#1d1440" />
            <rect
              x="-210"
              y="-143"
              width="420"
              height="130"
              rx="38"
              fill="#150e30"
              stroke="#3a2a78"
              stroke-width="5"
            />
            {[-1, 1].map((side) => (
              <g key={side}>
                <rect
                  x={side * 151 - 66}
                  y="-127"
                  width="132"
                  height="61"
                  rx="30"
                  fill="#ff4d6d"
                  opacity="0.18"
                />
                <rect
                  x={side * 151 - 42}
                  y="-109"
                  width="84"
                  height="25"
                  rx="10"
                  fill="#ff4d6d"
                />
              </g>
            ))}
            <path d={sparklePath(0, -97, 21)} fill="#d8d0ff" opacity="0.75" />
            <rect
              x="-185"
              y="-15"
              width="59"
              height="25"
              rx="4"
              fill="#0a0718"
            />
            <rect
              x="126"
              y="-15"
              width="59"
              height="25"
              rx="4"
              fill="#0a0718"
            />
          </g>
        </defs>

        <rect
          x="0"
          y="620"
          width="2000"
          height="505"
          fill="url(#rc-hero-ground-fill)"
        />
        {Array.from({ length: 49 }, (_, index) => (
          <line
            key={index}
            x1={VANISHING_X}
            y1={HORIZON}
            x2={VANISHING_X + (index - 24) * 150}
            y2={HEIGHT}
            stroke="#8a5cf0"
            stroke-width="1.6"
            opacity="0.45"
          />
        ))}
        {initialFrame.gridLines.map(({ y, strokeWidth, opacity }, index) => (
          <line
            key={index}
            data-grid-line
            x1="0"
            y1={y}
            x2="2000"
            y2={y}
            stroke="#8a5cf0"
            stroke-width={strokeWidth}
            opacity={opacity}
          />
        ))}
        <polygon
          points={`${VANISHING_X - 6},${HORIZON} ${VANISHING_X + 6},${HORIZON} ${VANISHING_X + ROAD_HALF_WIDTH},${HEIGHT} ${VANISHING_X - ROAD_HALF_WIDTH},${HEIGHT}`}
          fill="url(#rc-hero-road)"
        />
        <ellipse
          cx="1000"
          cy="640"
          rx="110"
          ry="250"
          fill="url(#rc-hero-reflection)"
        />
        {[-1, 1].map((side) =>
          [
            [18, 0.1],
            [9, 0.28],
            [4, 1],
          ].map(([strokeWidth, opacity]) => (
            <line
              key={`${side}-${strokeWidth}`}
              x1={VANISHING_X + side * 6}
              y1={HORIZON}
              x2={VANISHING_X + side * ROAD_HALF_WIDTH}
              y2={HEIGHT}
              stroke="#18b6f6"
              stroke-width={strokeWidth}
              opacity={opacity}
            />
          ))
        )}
        {initialFrame.dashes.map((points, index) => (
          <polygon
            key={index}
            data-dash
            points={points}
            fill="#f3ecff"
            opacity="0.75"
          />
        ))}
        {initialFrame.cars.map(({ transform, opacity }, index) => (
          <use
            key={index}
            data-car
            href="#rc-hero-car"
            transform={transform}
            opacity={opacity}
          />
        ))}

        <g data-trails opacity={initialFrame.trailOpacity}>
          {beams.map((points, index) => (
            <polygon key={index} points={points} fill="url(#rc-hero-beam)" />
          ))}
          {trails.map(({ points, fill, opacity }, index) => (
            <polygon
              key={index}
              points={points}
              fill={fill}
              opacity={opacity}
            />
          ))}
        </g>

        <g
          transform={`translate(${laneX(QWIK_CAR_DISTANCE, -1)} ${screenY(QWIK_CAR_DISTANCE)}) scale(${1 / QWIK_CAR_DISTANCE})`}
        >
          <ellipse
            cx="0"
            cy="0"
            rx="346"
            ry="44"
            fill="url(#rc-hero-underglow)"
          />
          <rect
            x="-211"
            y="-38"
            width="77"
            height="38"
            rx="10"
            fill="#07041a"
          />
          <rect x="134" y="-38" width="77" height="38" rx="10" fill="#07041a" />
          <path
            d="M -163 -162 L -115 -259 Q 0 -283 115 -259 L 163 -162 Z"
            fill="url(#rc-hero-cabin)"
            stroke="#6f8cff"
            stroke-width="4.7"
            stroke-opacity="0.8"
          />
          <rect
            x="-240"
            y="-163"
            width="480"
            height="144"
            rx="48"
            fill="#120b2e"
            stroke="#8f7cf7"
            stroke-width="5.3"
            stroke-opacity="0.9"
          />
          <rect
            x="-253"
            y="-160"
            width="506"
            height="86"
            rx="43"
            fill="url(#rc-hero-light-bar)"
            opacity="0.14"
          />
          <rect
            x="-235"
            y="-142"
            width="470"
            height="50"
            rx="25"
            fill="url(#rc-hero-light-bar)"
            opacity="0.35"
          />
          <rect
            x="-221"
            y="-128"
            width="442"
            height="21"
            rx="10.5"
            fill="url(#rc-hero-light-bar)"
          />
          <circle cx="0" cy="-65" r="56" fill="url(#rc-hero-emblem-glow)" />
          <path d={sparklePath(0, -65, 34)} fill="#ffffff" />
        </g>

        <rect
          x="0"
          y="620"
          width="2000"
          height="12"
          fill="url(#rc-hero-horizon)"
        />
        <rect
          x="0"
          y="620"
          width="2000"
          height="1.2"
          fill="#d9c7ff"
          opacity="0.8"
        />
        <rect
          x="0"
          y="0"
          width="2000"
          height="1125"
          fill="url(#rc-hero-vignette)"
        />
      </svg>
    </div>
  );
});
