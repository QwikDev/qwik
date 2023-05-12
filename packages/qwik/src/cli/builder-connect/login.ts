import { dirname, join } from 'node:path';
import { homedir, hostname } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { openBrowser } from '../utils/open';
import { cancel, spinner, isCancel, select } from '@clack/prompts';

let cachedCredentials: BuilderCredentials | null = null;

const CLIENT_ID = 'qwik-cli';

export const getBuildLogin = async (opts: BuilderLoginOpts) => {
  if (cachedCredentials) {
    return { ...cachedCredentials };
  }

  const credentialsPath = getCredentialsFilePath();
  if (existsSync(credentialsPath)) {
    const userCredentials: BuilderCredentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
    if (
      typeof userCredentials === 'object' &&
      userCredentials != null &&
      userCredentials.version === '1'
    ) {
      cachedCredentials = { ...userCredentials };
      return userCredentials;
    }
  }

  const builderToken = await getNewBuilderToken(opts);
  if (!builderToken) {
    return null;
  }

  const userCredentials = await saveLogin(builderToken);
  return userCredentials;
};

const getNewBuilderToken = async (opts: BuilderLoginOpts) => {
  const connectNowAnswer = await select({
    message: `Would you like to connect this app to Builder.io now?`,
    options: [
      { value: true, label: `Yes, let's open a browser and connect to Builder.io` },
      { value: false, label: `No, I'll connect Builder.io later` },
    ],
  });

  if (isCancel(connectNowAnswer)) {
    cancel('Operation cancelled.');
    process.exit(0);
  }

  const shouldConnect = connectNowAnswer as boolean;
  if (!shouldConnect) {
    return null;
  }

  const s = spinner();
  s.start('Connecting Builder.io...');

  return new Promise<BuilderLoginData>((resolve, reject) => {
    const port = 10110;

    const server = createServer((req, res) => {
      const requestUrl = new URL(req.url!, `http://localhost:${port}/`);
      if (requestUrl.pathname !== '/auth') {
        // only /auth is handled
        res
          .writeHead(404, {
            'Content-Type': 'text/plain; charset=utf-8',
          })
          .end('File not found');
        return;
      }

      const privateKey = requestUrl.searchParams.get('p-key');
      if (!privateKey) {
        s.stop('Failed to connect to Builder.io: Missing p-key');
        server.close();
        reject(new Error('Missing p-key'));
        return;
      }

      const apiKey = requestUrl.searchParams.get('api-key');
      if (!apiKey) {
        s.stop('Failed to connect to Builder.io: Missing api-key');
        server.close();
        reject(new Error('Missing api-key'));
        return;
      }

      res
        .writeHead(302, {
          Location: opts.redirectUrl,
        })
        .end();

      req.socket.end();
      req.socket.destroy();
      server.close();

      s.stop('Successfully connected to Builder.io 🦋');

      const loginData: BuilderLoginData = {
        privateKey,
        apiKey,
      };
      resolve(loginData);
    }).listen(port);

    const authUrl = new URL(`/cli-auth`, `https://builder.io`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('host', hostname());
    authUrl.searchParams.set('cli', 'true');

    return openBrowser(authUrl);
  });
};

const saveLogin = async (input: Partial<BuilderLoginData>): Promise<BuilderCredentials> => {
  const credentialsPath = getCredentialsFilePath();

  const userCredentials: BuilderCredentials = {
    ...(cachedCredentials || {}),
    version: '1',
  };
  if (input.privateKey) {
    userCredentials.privateKey = input.privateKey;
  }
  if (input.apiKey) {
    userCredentials.apiKey = input.apiKey;
  }
  cachedCredentials = { ...userCredentials };

  mkdirSync(dirname(credentialsPath), { recursive: true });
  writeFileSync(credentialsPath, JSON.stringify(userCredentials));

  return userCredentials;
};

const getCredentialsFilePath = () => {
  return join(homedir(), '.config', 'builder', 'credentials.json');
};

export interface BuilderCredentials {
  version: '1';
  privateKey?: string;
  apiKey?: string;
}

interface BuilderLoginData {
  privateKey: string;
  apiKey: string;
}

export interface BuilderLoginOpts {
  redirectUrl: string;
}
