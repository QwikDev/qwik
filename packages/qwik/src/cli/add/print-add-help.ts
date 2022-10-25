/* eslint-disable no-console */
import color from 'kleur';
import { loadIntegrations } from '../utils/integrations';
import { pmRunCmd } from '../utils/utils';

export async function printAddHelp() {
  const integrations = await loadIntegrations();
  const adaptors = integrations.filter((i) => i.type === 'adaptor');
  const features = integrations.filter((i) => i.type === 'feature');
  const pmRun = pmRunCmd();

  console.log(``);
  console.log(`${pmRun} qwik ${color.magenta(`add`)} [integration]`);
  console.log(``);

  console.log(`  ${color.cyan('Adaptors')}`);
  for (const s of adaptors) {
    console.log(`    ${s.id}  ${color.dim(s.pkgJson.description)}`);
  }
  console.log(``);

  console.log(`  ${color.cyan('Features')}`);
  for (const s of features) {
    console.log(`    ${s.id}  ${color.dim(s.pkgJson.description)}`);
  }
  console.log(``);
}
