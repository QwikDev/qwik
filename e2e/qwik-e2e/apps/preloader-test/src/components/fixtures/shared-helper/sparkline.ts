const BARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export const drawSparkline = (values: number[]) => {
  const max = Math.max(...values, 1);
  return values.map((value) => BARS[Math.round((value / max) * (BARS.length - 1))]).join('');
};
