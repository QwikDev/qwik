import { readFileSync, writeFileSync } from 'fs';
import { log } from '@clack/prompts';

export function updateConfigurations() {
  try {
    updateTsconfig();
  } catch (error) {
    log.error('Failed to update tsconfig.json configuration.');
  }
}

function updateTsconfig() {
  const tsConfigPath = 'tsconfig.json';
  const tsConfig = JSON.parse(readFileSync(tsConfigPath, 'utf-8'));
  if (!tsConfig) {
    return;
  }
  tsConfig.compilerOptions.moduleResolution = 'bundler';
  writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
}
