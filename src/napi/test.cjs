//  node src/napi/test.cjs

async function run() {
  const { Optimizer } = require('../../dist-dev/@builder.io-qwik/optimizer/index.cjs');
  const optimizer = new Optimizer();
  await optimizer.transformCode();
}

run();
