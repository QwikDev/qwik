require("source-map-support/register");
const express = require("express");
const serverlessExpress = require("@vendia/serverless-express");
let serverlessExpressInstance;

/**
 * Some async functions
 */
function asyncTask() {
  // console.log(" Connection to database.....");
}

async function setup(event, context) {
  //await asyncTask();
  const { router, notFound, distDir, buildDir } = await import(
    "./server/entry.aws-lambda.mjs"
  );
  const app = express();
  app.use(
    `/build`,
    express.static(buildDir, { immutable: true, maxAge: "1y" })
  );
  app.use(express.static(distDir, { redirect: false }));
  app.use(router);
  app.use(notFound);
  serverlessExpressInstance = serverlessExpress({ app });
  return serverlessExpressInstance(event, context);
}

function handler(event, context) {
  if (serverlessExpressInstance)
    return serverlessExpressInstance(event, context);

  return setup(event, context);
}

exports.qwikApp = handler;