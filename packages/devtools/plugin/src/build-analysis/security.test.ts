import { describe, expect, test } from 'vitest';
import {
  getRpcClientRemoteAddress,
  isBuildAnalysisRpcAllowed,
  isLoopbackAddress,
  isRemoteBuildAnalysisEnabled,
} from './security';

describe('build analysis RPC security', () => {
  test('allows loopback websocket clients by default', () => {
    expect(isBuildAnalysisRpcAllowed({ socket: { remoteAddress: '127.0.0.1' } }, {})).toBe(true);
    expect(isBuildAnalysisRpcAllowed({ socket: { remoteAddress: '::1' } }, {})).toBe(true);
    expect(isBuildAnalysisRpcAllowed({ socket: { remoteAddress: '::ffff:127.0.0.1' } }, {})).toBe(
      true
    );
    expect(
      isBuildAnalysisRpcAllowed({ socket: { _socket: { remoteAddress: '127.0.0.1' } } }, {})
    ).toBe(true);
  });

  test('rejects non-loopback websocket clients by default', () => {
    expect(isBuildAnalysisRpcAllowed({ socket: { remoteAddress: '192.168.1.10' } }, {})).toBe(
      false
    );
    expect(isBuildAnalysisRpcAllowed({ socket: { remoteAddress: '10.0.0.22' } }, {})).toBe(false);
    expect(isBuildAnalysisRpcAllowed({}, {})).toBe(false);
  });

  test('supports explicit env opt-in for remote execution', () => {
    expect(
      isBuildAnalysisRpcAllowed(
        { socket: { remoteAddress: '192.168.1.10' } },
        { QWIK_DEVTOOLS_ALLOW_REMOTE_BUILD_ANALYSIS: 'true' }
      )
    ).toBe(true);
    expect(isRemoteBuildAnalysisEnabled({ QWIK_DEVTOOLS_ALLOW_REMOTE_BUILD_ANALYSIS: '1' })).toBe(
      true
    );
  });

  test('extracts remote address from vite websocket client shapes', () => {
    expect(getRpcClientRemoteAddress({ socket: { remoteAddress: '127.0.0.1' } })).toBe('127.0.0.1');
    expect(getRpcClientRemoteAddress({ socket: { _socket: { remoteAddress: '127.0.0.1' } } })).toBe(
      '127.0.0.1'
    );
    expect(getRpcClientRemoteAddress({ _socket: { remoteAddress: '127.0.0.1' } })).toBe(
      '127.0.0.1'
    );
    expect(getRpcClientRemoteAddress(null)).toBeUndefined();
  });

  test('recognizes supported loopback formats', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('192.168.1.10')).toBe(false);
  });
});
