import { ChildProcess, exec, execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { yellow } from 'kleur/colors';
import { dirname, join, resolve } from 'path';
import { dirSync } from 'tmp';
import treeKill from 'tree-kill';
import { promisify } from 'util';
import { createDocument } from '../../../packages/qwik/src/testing/document';

export type QwikProjectType = 'playground' | 'library' | 'empty';
export function scaffoldQwikProject(type: QwikProjectType): {
  tmpDir: string;
  cleanupFn: () => void;
} {
  const tmpHostDirData = getTmpDirSync(
    process.env.TEMP_E2E_PATH ? `${process.env.TEMP_E2E_PATH}/${type}` : undefined
  );
  const cleanupFn = () => {
    if (!tmpHostDirData.overridden) {
      cleanup(tmpHostDirData.path);
    } else {
      log('Custom E2E test path was used, skipping the removal of test folder');
    }
  };
  try {
    const tmpDir = runCreateQwikCommand(tmpHostDirData.path, type);
    log(`Created test application at "${tmpDir}"`);
    replacePackagesWithLocalOnes(tmpDir);
    return { cleanupFn, tmpDir };
  } catch (error) {
    cleanupFn();
    throw error;
  }
}

function cleanup(tmpDir: string) {
  log(`Removing tmp dir "${tmpDir}"`);
  rmSync(tmpDir, { recursive: true });
}

function getTmpDirSync(tmpDirOverride?: string) {
  if (tmpDirOverride) {
    tmpDirOverride = resolve(workspaceRoot, tmpDirOverride);
  }

  if (tmpDirOverride && !existsSync(tmpDirOverride)) {
    throw new Error(`"${tmpDirOverride}" does not exist.`);
  }
  if (tmpDirOverride) {
    const p = join(tmpDirOverride, 'qwik_e2e');
    if (existsSync(p)) {
      log(`Removing project folder "${p}" (will be recreated).`);
      rmSync(p, { recursive: true });
    }
    mkdirSync(p);
    return { path: p, overridden: true };
  }
  return { path: dirSync({ prefix: 'qwik_e2e' }).name, overridden: false };
}

function runCreateQwikCommand(tmpDir: string, type: 'playground' | 'library' | 'empty'): string {
  const appDir = 'e2e-app';
  execSync(
    `node "${workspaceRoot}/packages/create-qwik/create-qwik.mjs" ${type} "${join(tmpDir, appDir)}"`
  );
  return join(tmpDir, appDir);
}

function replacePackagesWithLocalOnes(tmpDir: string) {
  const tarballConfig = JSON.parse(
    readFileSync(join(workspaceRoot, 'temp/tarballs/paths.json'), 'utf-8')
  );
  for (const { name, absolutePath } of tarballConfig) {
    patchPackageJsonForPlugin(tmpDir, name, absolutePath);
  }
  execSync('pnpm i', {
    cwd: tmpDir,
    // only output errors
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

function patchPackageJsonForPlugin(tmpDirName: string, npmPackageName: string, distPath: string) {
  const path = join(tmpDirName, 'package.json');
  const json = JSON.parse(readFileSync(path, 'utf-8'));
  json.devDependencies[npmPackageName] = `file:${distPath}`;
  writeFileSync(path, JSON.stringify(json));
}

export function registerExecutedChildProcess(process: ChildProcess) {
  if (typeof global !== 'undefined') {
    (global.pIds ??= []).push(process.pid);
    log(`Registered a process with id "${process.pid}"`);
  } else {
    throw new Error('"global" is not defined');
  }
}

export function runCommandUntil(
  command: string,
  tmpDir: string,
  criteria: (output: string) => boolean
): Promise<ChildProcess> {
  const p = exec(command, {
    cwd: tmpDir,
    encoding: 'utf-8',
  });
  registerExecutedChildProcess(p);
  return new Promise<ChildProcess>((res, rej) => {
    let output = '';
    let complete = false;

    function checkCriteria(c: any) {
      output += c.toString();
      console.warn(output);
      if (criteria(stripConsoleColors(output)) && !complete) {
        complete = true;
        res(p);
      }
    }

    p.stdout?.on('data', checkCriteria);
    p.stderr?.on('data', checkCriteria);
    p.on('exit', (code) => {
      if (!complete) {
        rej(`Exited with ${code}`);
      } else {
        res(p);
      }
    });
  });
}

function stripConsoleColors(log: string): string {
  return log.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ''
  );
}

export async function getPageHtml(pageUrl: string): Promise<Document> {
  const res = await fetch(pageUrl, { headers: { accept: 'text/html' } }).then((r) => r.text());
  return createDocument({ html: res });
}

export async function assertHostUnused(host: string): Promise<void> {
  try {
    const response = await fetch(host, { headers: { accept: 'text/html' } });
  } catch (error) {
    // TODO: test this in different environments
    if (error.cause.code === 'ECONNREFUSED') {
      return;
    }
  }
  throw new Error(`Host ${host} is already in use!`);
}

// promisify fails to get the proper type overload, so manually enforcing the type
const _promisifiedTreeKill = promisify(treeKill) as (pid: number, signal: string) => Promise<void>;

export const promisifiedTreeKill = async (pid: number, signal: string) => {
  try {
    return await _promisifiedTreeKill(pid, signal);
  } catch (error) {
    // Don't treat process termination failures as test failures
    // This is especially important on Windows where processes may already be gone
    // or may not be properly terminated with tree-kill
    log(`Process ${pid} could not be killed, but continuing: ${error.message}`);
    return Promise.resolve();
  }
};

export async function killAllRegisteredProcesses() {
  const pIds = (global?.pIds as number[]) ?? [];
  const result = await Promise.allSettled(pIds.map((pId) => promisifiedTreeKill(pId, 'SIGKILL')));
  const stringifiedResult = JSON.stringify(
    result.map((v, i) => ({
      pId: pIds[i],
      status: v.status === 'fulfilled' ? 'success' : 'failure',
    }))
  );
  log('Cleaned up processes invoked by e2e test: ' + stringifiedResult);
}

export const workspaceRoot = _computeWorkspaceRoot(process.cwd());

function _computeWorkspaceRoot(cwd: string) {
  if (dirname(cwd) === cwd) {
    return process.cwd();
  }

  const packageJsonAtCwd = join(cwd, 'package.json');
  if (existsSync(packageJsonAtCwd)) {
    const content = JSON.parse(readFileSync(packageJsonAtCwd, 'utf-8'));
    if (content.name === 'qwik-monorepo') {
      return cwd;
    }
  }
  return _computeWorkspaceRoot(dirname(cwd));
}

export function log(text: string) {
  // eslint-disable-next-line no-console
  console.log(yellow('E2E: ' + text));
}

export const DEFAULT_TIMEOUT = 30000;
