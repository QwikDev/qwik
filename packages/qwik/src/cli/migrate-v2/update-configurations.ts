import { readFileSync, writeFileSync } from 'fs';

export function updateConfigurations() {
  updateTsconfig();
}

function updateTsconfig() {
  const tsConfigPath = 'tsconfig.json';
  const tsConfig = JSON.parse(readFileSync(tsConfigPath, 'utf-8'));
  if (!tsConfig) {
    return;
  }
  tsConfig.moduleResolution = 'bundler';
  writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
}
