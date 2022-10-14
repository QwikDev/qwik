export function generateSsgModule(opts: {
  renderModulePath: string;
  qwikCityPlanModulePath: string;
  outDir: string;
}) {
  const o: string[] = [];

  o.push(`import { generate } from '@builder.io/qwik-city/static';`);
  o.push(`import render from "${opts.renderModulePath}";`);
  o.push(`import { qwikCityPlan } from "${opts.qwikCityPlanModulePath}";`);
  o.push(``);
  o.push(`generate({`);
  o.push(`  render,`);
  o.push(`  qwikCityPlan,`);
  o.push(`  origin: process.env.CF_PAGES_URL,`);
  o.push(`  outDir: ${JSON.stringify(opts.outDir)},`);
  o.push(`  currentFile: import.meta.url,`);
  o.push(`});`);

  return o.join('\n') + '\n';
}

export function generateServerPackageJson() {
  return JSON.stringify(
    {
      type: 'module',
    },
    null,
    2
  );
}

export async function runStaticSiteGenerations() {}
