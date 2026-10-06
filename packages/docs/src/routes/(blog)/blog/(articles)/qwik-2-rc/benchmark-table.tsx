import { component$, useStyles$ } from '@qwik.dev/core';
import styles from './benchmark-table.css?inline';

const frameworks = [
  { name: 'Vanilla JS', version: 'baseline' },
  { name: 'Qwik v2', version: '2.0.0-rc.0', isHighlighted: true },
  { name: 'Vue', version: '3.5.39' },
  { name: 'Angular', version: '22.0.0, zoneless' },
  { name: 'React', version: '19.0.0, compiler' },
  { name: 'Qwik v1', version: '1.20.1' },
];

const operations = [
  {
    name: 'Create 1,000 rows',
    means: [20.9, 26.8, 24.7, 33.7, 25.5, 80.5],
    confidenceIntervals: [0.2, 0.1, 0.8, 0.5, 0.7, 1.0],
  },
  {
    name: 'Replace all rows',
    means: [22.5, 30.8, 27.3, 33.9, 30.0, 83.6],
    confidenceIntervals: [0.3, 0.3, 0.4, 0.9, 0.4, 2.8],
  },
  {
    name: 'Update every 10th row',
    means: [13.2, 15.1, 18.5, 13.7, 18.3, 17.6],
    confidenceIntervals: [10.4, 0.3, 0.8, 1.9, 0.4, 7.0],
  },
  {
    name: 'Select a row',
    means: [3.0, 3.8, 4.3, 6.6, 7.9, 10.0],
    confidenceIntervals: [0.2, 0.3, 0.2, 0.3, 0.3, 1.0],
  },
  {
    name: 'Swap two rows',
    means: [14.1, 17.7, 16.7, 16.5, 96.6, 27.0],
    confidenceIntervals: [0.4, 0.4, 0.3, 2.0, 1.6, 6.7],
  },
  {
    name: 'Remove a row',
    means: [11.6, 11.9, 14.0, 12.3, 13.3, 17.3],
    confidenceIntervals: [0.1, 0.2, 0.5, 0.6, 0.2, 0.3],
  },
  {
    name: 'Create 10,000 rows',
    means: [208.5, 275.7, 247.8, 291.0, 414.8, 757.6],
    confidenceIntervals: [2.2, 1.5, 0.7, 3.1, 8.2, 162.7],
  },
  {
    name: 'Append 1,000 rows to a large table',
    means: [24.3, 30.0, 28.1, 35.9, 29.8, 74.2],
    confidenceIntervals: [0.2, 1.0, 0.4, 0.4, 0.2, 3.1],
  },
  {
    name: 'Clear all rows',
    means: [11.0, 13.1, 16.3, 21.6, 21.5, 23.2],
    confidenceIntervals: [0.1, 0.2, 0.4, 0.3, 0.4, 11.3],
  },
];

const weightedGeometricMeans = [1.0, 1.23, 1.25, 1.42, 1.53, 2.59];

const slowdownColor = (slowdown: number) => {
  if (slowdown < 2) {
    const towardsMedium = Math.round((slowdown - 1) * 100);
    return `color-mix(in srgb, var(--slowdown-medium) ${towardsMedium}%, var(--slowdown-fast))`;
  }
  const towardsSlow = Math.round(Math.min((slowdown - 2) / 2, 1) * 100);
  return `color-mix(in srgb, var(--slowdown-slow) ${towardsSlow}%, var(--slowdown-medium))`;
};

export const BenchmarkTable = component$(() => {
  useStyles$(styles);

  return (
    <figure class="benchmark-table">
      <div class="benchmark-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Operation (ms)</th>
              {frameworks.map(({ name, version, isHighlighted }) => (
                <th
                  key={name}
                  scope="col"
                  class={{ 'is-highlighted': isHighlighted }}
                >
                  <span class="framework-name">{name}</span>
                  <span class="framework-version">{version}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {operations.map(({ name, means, confidenceIntervals }) => {
              const fastestMean = Math.min(...means);
              return (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  {means.map((mean, index) => {
                    const slowdown = mean / fastestMean;
                    return (
                      <td
                        key={frameworks[index].name}
                        style={{ backgroundColor: slowdownColor(slowdown) }}
                      >
                        {mean.toFixed(1)}{' '}
                        <span class="confidence-interval">
                          ±{confidenceIntervals[index].toFixed(1)}
                        </span>
                        <span class="slowdown">{slowdown.toFixed(2)}×</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Weighted geometric mean</th>
              {weightedGeometricMeans.map((geometricMean, index) => (
                <td
                  key={frameworks[index].name}
                  style={{ backgroundColor: slowdownColor(geometricMean) }}
                >
                  {geometricMean.toFixed(2)}×
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <figcaption>
        <span>
          Mean duration ± 95% confidence interval, and how many times slower
          than the fastest. Lower is better.
        </span>
        <span class="slowdown-legend" aria-hidden="true">
          1×
          <span class="slowdown-scale" />
          4×+
        </span>
      </figcaption>
    </figure>
  );
});
