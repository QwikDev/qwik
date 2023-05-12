import { join } from 'node:path';
import { getBuildLogin, type BuilderCredentials } from './login';
import { readFile, writeFile } from 'node:fs/promises';
import { error } from '../utils/utils';

export const connectBuilder = async (outDir: string) => {
  try {
    const credentials = await getBuildLogin({
      redirectUrl: 'http://localhost:3000/idk-redirect-url',
    });
    if (credentials) {
      await updateBuilderProject(outDir, credentials);
    }
  } catch (e: any) {
    error(`Failed to connect to Builder.io: ${e.message}`);
  }
};

const updateBuilderProject = async (outDir: string, credentials: BuilderCredentials) => {
  const envFilePath = join(outDir, '.env');
  try {
    let envFile = await readFile(envFilePath, 'utf-8');
    envFile = envFile.replace(
      /PUBLIC_BUILDER_API_KEY=.*/,
      `PUBLIC_BUILDER_API_KEY=${credentials.privateKey}`
    );
    await writeFile(envFilePath, envFile);
  } catch (e) {
    error(`Could not update ${envFilePath}`);
  }
};
