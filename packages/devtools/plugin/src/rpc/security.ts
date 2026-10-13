const REMOTE_BUILD_ANALYSIS_ENV = 'QWIK_DEVTOOLS_ALLOW_REMOTE_BUILD_ANALYSIS';
const REMOTE_PACKAGE_MANAGEMENT_ENV = 'QWIK_DEVTOOLS_ALLOW_REMOTE_PACKAGE_MANAGEMENT';
const TRUTHY_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);

type RpcClientSocket = {
  remoteAddress?: string | null;
  socket?: unknown;
  _socket?: unknown;
};

type RpcClientLike = {
  socket?: RpcClientSocket | null;
  _socket?: RpcClientSocket | null;
};

function isEnvFlagEnabled(name: string, env: NodeJS.ProcessEnv): boolean {
  const rawValue = env[name];
  if (!rawValue) {
    return false;
  }
  return TRUTHY_ENV_VALUES.has(rawValue.trim().toLowerCase());
}

export function getRpcClientRemoteAddress(client: unknown): string | undefined {
  if (!client || typeof client !== 'object') {
    return undefined;
  }

  const candidate = client as RpcClientLike;
  return getSocketRemoteAddress(candidate.socket) ?? getSocketRemoteAddress(candidate._socket);
}

function getSocketRemoteAddress(socket: unknown): string | undefined {
  if (!socket || typeof socket !== 'object') {
    return undefined;
  }

  const queue: RpcClientSocket[] = [socket as RpcClientSocket];
  const seen = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }

    seen.add(current);

    if (typeof current.remoteAddress === 'string' && current.remoteAddress.length > 0) {
      return current.remoteAddress;
    }

    if (current.socket && typeof current.socket === 'object') {
      queue.push(current.socket as RpcClientSocket);
    }

    if (current._socket && typeof current._socket === 'object') {
      queue.push(current._socket as RpcClientSocket);
    }
  }

  return undefined;
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }
  if (address === '127.0.0.1' || address === '::1') {
    return true;
  }
  if (address.startsWith('::ffff:')) {
    return isLoopbackAddress(address.slice('::ffff:'.length));
  }
  return false;
}

function isRpcClientAllowed(
  client: unknown,
  remoteOptInEnv: string,
  env: NodeJS.ProcessEnv
): boolean {
  if (isEnvFlagEnabled(remoteOptInEnv, env)) {
    return true;
  }

  return isLoopbackAddress(getRpcClientRemoteAddress(client));
}

export function isBuildAnalysisRpcAllowed(
  client: unknown,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isRpcClientAllowed(client, REMOTE_BUILD_ANALYSIS_ENV, env);
}

export function isPackageManagementRpcAllowed(
  client: unknown,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isRpcClientAllowed(client, REMOTE_PACKAGE_MANAGEMENT_ENV, env);
}

export function getPackageManagementRpcGuardError(): string {
  return `Refusing to change project dependencies from a non-local DevTools RPC client. Reconnect from localhost or set ${REMOTE_PACKAGE_MANAGEMENT_ENV}=1 to opt in to remote package management.`;
}

export function getBuildAnalysisRpcGuardError(): string {
  return `Refusing to run the project build from a non-local DevTools RPC client. Reconnect from localhost or set ${REMOTE_BUILD_ANALYSIS_ENV}=1 to opt in to remote build-analysis execution.`;
}

export function getBuildAnalysisRpcGuardHint(): string {
  return `Automatic rebuild is unavailable from this DevTools client. Reconnect from localhost or set ${REMOTE_BUILD_ANALYSIS_ENV}=1 to opt in to remote build-analysis execution.`;
}
