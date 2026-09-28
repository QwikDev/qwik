import { readFileSync, writeFileSync } from 'node:fs';

const [output, regressionPath, ...calibrationPaths] = process.argv.slice(2);
if (calibrationPaths.length !== 5) {
  throw new Error('Usage: budget.mjs output.json regression.json calibration-{1..5}.json');
}
const reports = calibrationPaths.map((path) => JSON.parse(readFileSync(path, 'utf8')));
const regression = JSON.parse(readFileSync(regressionPath, 'utf8'));
const environment = reports[0].environment;
if (
  environment.platform !== 'linux' ||
  environment.runner !== 'Linux' ||
  environment.image !== 'ubuntu24'
) {
  throw new Error('The committed budget must be calibrated on the ubuntu-24.04 runner.');
}
for (const report of [...reports, regression]) {
  if (
    report.cleanupGc !== true ||
    report.warmup !== 10 ||
    report.samples.length !== 30 ||
    !Number.isFinite(report.median) ||
    report.median <= 0 ||
    ['node', 'chromium', 'playwright', 'platform', 'runner', 'image'].some(
      (key) => report.environment[key] !== environment[key]
    )
  ) {
    throw new Error('Calibration requires complete runs in the same environment.');
  }
}
const medians = reports.map((report) => report.median);
const budget = Math.max(...medians) * 1.5;
if (regression.median <= budget) {
  throw new Error('The regressed compiler does not fail the calibrated budget.');
}
writeFileSync(
  output,
  JSON.stringify(
    {
      runner: 'ubuntu-24.04',
      cleanupGc: true,
      environment,
      medians,
      budget,
      regressionMedian: regression.median,
    },
    null,
    2
  ) + '\n'
);
process.stdout.write(
  `Budget: ${budget.toFixed(2)} ms; regression: ${regression.median.toFixed(2)} ms.\n`
);
