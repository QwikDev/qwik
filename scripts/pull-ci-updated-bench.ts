import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BENCH_DIR = 'packages/qwik/src/core/bench';
const ARTIFACT_NAME = 'bench-updated';
const WORKFLOW = 'ci.yml';

async function main() {
  const arg = process.argv[2];
  const runId = arg ? extractRunId(arg) : await resolveLatestRunId();
  console.log(`Pulling ${ARTIFACT_NAME} from run ${runId}`);

  const stagingDir = await mkdtemp(join(tmpdir(), 'bench-updated-'));
  try {
    await sh('gh', ['run', 'download', runId, '-n', ARTIFACT_NAME, '-D', stagingDir]);
    const files = await readdir(stagingDir);
    for (const file of files) {
      await rename(join(stagingDir, file), resolve(BENCH_DIR, file));
    }
    console.log(`\nReplaced ${files.length} file(s) in ${BENCH_DIR}.`);
    console.log(`Review with:\n  git diff ${BENCH_DIR}`);
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

async function resolveLatestRunId(): Promise<string> {
  const fromPr = await latestRunIdForCurrentPr();
  if (fromPr) {
    return fromPr;
  }
  return latestRunIdForCurrentBranch();
}

async function latestRunIdForCurrentPr(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('gh', [
      'pr',
      'view',
      '--json',
      'statusCheckRollup,number',
    ]);
    const data = JSON.parse(stdout) as {
      number: number;
      statusCheckRollup: Array<{ workflowName?: string; detailsUrl?: string }>;
    };
    const ciCheck = data.statusCheckRollup.find(
      (check) => check.workflowName === 'Qwik CI' && check.detailsUrl
    );
    if (!ciCheck?.detailsUrl) {
      return null;
    }
    const match = ciCheck.detailsUrl.match(/\/runs\/(\d+)/);
    if (!match) {
      return null;
    }
    console.log(`Resolved run ${match[1]} from PR #${data.number}`);
    return match[1];
  } catch {
    return null;
  }
}

function extractRunId(input: string): string {
  const match = input.match(/(\d{6,})/);
  if (!match) {
    throw new Error(`Could not extract a run id from: ${input}`);
  }
  return match[1];
}

async function latestRunIdForCurrentBranch(): Promise<string> {
  const { stdout: branchOut } = await execFileAsync('git', ['branch', '--show-current']);
  const branch = branchOut.trim();
  if (!branch) {
    throw new Error('Could not determine current git branch.');
  }
  const { stdout } = await execFileAsync('gh', [
    'run',
    'list',
    '--workflow',
    WORKFLOW,
    '--branch',
    branch,
    '--limit',
    '1',
    '--json',
    'databaseId,status,conclusion',
  ]);
  const runs = JSON.parse(stdout) as Array<{
    databaseId: number;
    status: string;
    conclusion: string | null;
  }>;
  if (runs.length === 0) {
    throw new Error(`No runs found for branch ${branch} on workflow ${WORKFLOW}.`);
  }
  return String(runs[0].databaseId);
}

async function sh(cmd: string, args: string[]) {
  const { stdout, stderr } = await execFileAsync(cmd, args);
  if (stdout.trim()) {
    process.stdout.write(stdout);
  }
  if (stderr.trim()) {
    process.stderr.write(stderr);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
