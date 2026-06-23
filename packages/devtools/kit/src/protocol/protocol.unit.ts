import { describe, expect, test } from 'vitest';
import * as protocol from './index';
import {
  QWIK_DEVTOOLS_GLOBAL,
  DEVTOOLS_MESSAGES,
  QWIK_VNODE_PROTOCOL,
  VIRTUAL_QWIK_DEVTOOLS_KEY,
  VARIABLE_DECLARATION_LIST,
  EXPRESSION_STATEMENT_LIST,
  USE_HOOK_LIST,
  NORETURN_HOOK,
  SIGNAL_HOOK_TYPES,
  PERF_VIRTUAL_MODULE_ID,
} from './index';

describe('devtools protocol', () => {
  test('keeps current global and message names grouped by protocol area', () => {
    expect(QWIK_DEVTOOLS_GLOBAL).toEqual({
      key: '__QWIK_DEVTOOLS__',
      version: 1,
      props: {
        componentState: 'componentState',
        hook: 'hook',
        pageDataSource: 'pageDataSource',
        dataProvider: 'dataProvider',
        perf: 'perf',
        preloads: 'preloads',
        ssrPreloads: 'ssrPreloads',
      },
      ssr: {
        perfStore: '__QWIK_SSR_PERF__',
        preloadsProcessStore: '__QWIK_SSR_PRELOADS__',
        perfId: '__QWIK_SSR_PERF_ID__',
        perfIndex: '__QWIK_SSR_PERF_INDEX__',
        perfCount: '__QWIK_SSR_PERF_COUNT__',
      },
    });
    expect(DEVTOOLS_MESSAGES).toEqual({
      pageSource: 'qwik-devtools',
      viteMessagingEvent: 'qwik_tools:vite_messaging_event',
      types: {
        render: 'RENDER_EVENT',
        componentTreeUpdate: 'COMPONENT_TREE_UPDATE',
      },
      events: {
        preloadsUpdate: 'qwik:preloads-update',
        ssrPerf: 'qwik:ssr-perf',
        ssrPreloads: 'qwik:ssr-preloads',
      },
    });
  });

  test('keeps current Qwik internal field names grouped by protocol area', () => {
    expect(QWIK_VNODE_PROTOCOL).toEqual({
      attrs: {
        seq: 'q:seq',
        props: 'q:props',
        renderFn: 'q:renderFn',
        type: 'q:type',
        id: 'q:id',
        key: 'q:key',
        colon: ':',
      },
      qrl: {
        qrl: '$qrl$',
        computed: '$computeQrl$',
        chunk: '$chunk$',
        symbol: '$symbol$',
        captureRef: '$captureRef$',
        untrackedValue: '$untrackedValue$',
      },
      bridgeVirtualModuleId: 'virtual:qwik-devtools-bridge',
    });
  });

  test('does not re-export flattened protocol constants', () => {
    const protocolExports = protocol as Record<string, unknown>;
    expect(protocolExports.QWIK_DEVTOOLS_GLOBAL_VERSION).toBeUndefined();
    expect(protocolExports.QWIK_DEVTOOLS_COMPONENT_STATE).toBeUndefined();
    expect(protocolExports.QWIK_DEVTOOLS_HOOK).toBeUndefined();
    expect(protocolExports.QWIK_DEVTOOLS_PAGE_DATA_SOURCE).toBeUndefined();
    expect(protocolExports.QWIK_DEVTOOLS_DATA_PROVIDER).toBeUndefined();
    expect(protocolExports.QWIK_PERF_STORE).toBeUndefined();
    expect(protocolExports.QWIK_PRELOADS_STORE).toBeUndefined();
    expect(protocolExports.QWIK_SSR_PRELOADS_STORE).toBeUndefined();
    expect(protocolExports.QWIK_SSR_PERF_STORE).toBeUndefined();
    expect(protocolExports.QWIK_SSR_PRELOADS_PROCESS_STORE).toBeUndefined();
    expect(protocolExports.QWIK_SSR_PERF_ID).toBeUndefined();
    expect(protocolExports.QWIK_SSR_PERF_INDEX).toBeUndefined();
    expect(protocolExports.QWIK_SSR_PERF_COUNT).toBeUndefined();
    expect(protocolExports.DEVTOOLS_PAGE_MESSAGE_SOURCE).toBeUndefined();
    expect(protocolExports.DEVTOOLS_VITE_MESSAGING_EVENT).toBeUndefined();
    expect(protocolExports.DEVTOOLS_RENDER_EVENT).toBeUndefined();
    expect(protocolExports.DEVTOOLS_COMPONENT_TREE_UPDATE).toBeUndefined();
    expect(protocolExports.QWIK_PRELOADS_UPDATE_EVENT).toBeUndefined();
    expect(protocolExports.QSEQ).toBeUndefined();
    expect(protocolExports.QPROPS).toBeUndefined();
    expect(protocolExports.QRENDERFN).toBeUndefined();
    expect(protocolExports.QTYPE).toBeUndefined();
    expect(protocolExports.QRL_KEY).toBeUndefined();
    expect(protocolExports.COMPUTED_QRL_KEY).toBeUndefined();
    expect(protocolExports.CHUNK_KEY).toBeUndefined();
    expect(protocolExports.CAPTURE_REF_KEY).toBeUndefined();
  });

  test('keeps current hook and virtual module names stable', () => {
    expect(VIRTUAL_QWIK_DEVTOOLS_KEY).toBe('virtual-qwik-devtools.ts');
    expect(PERF_VIRTUAL_MODULE_ID).toBe('virtual:qwik-component-proxy');
    expect([...VARIABLE_DECLARATION_LIST]).toEqual([
      'useStore',
      'useSignal',
      'useComputed',
      'useAsyncComputed',
      'useContext',
      'useId',
      'useStyles',
      'useStylesScoped',
      'useConstant',
      'useErrorBoundary',
      'useSerializer',
      'useServerData',
      'useLocation',
      'useNavigate',
      'useContent',
      'useDocumentHead',
    ]);
    expect([...EXPRESSION_STATEMENT_LIST]).toEqual([
      'useVisibleTask',
      'useTask',
      'useResource',
      'useContextProvider',
      'usePreventNavigate',
    ]);
    expect([...USE_HOOK_LIST]).toEqual([
      'useStore',
      'useSignal',
      'useComputed',
      'useAsyncComputed',
      'useContext',
      'useId',
      'useStyles',
      'useStylesScoped',
      'useConstant',
      'useErrorBoundary',
      'useSerializer',
      'useServerData',
      'useLocation',
      'useNavigate',
      'useContent',
      'useDocumentHead',
      'useOn',
      'useOnDocument',
      'useOnWindow',
      'useVisibleTask',
      'useTask',
      'useResource',
      'useContextProvider',
      'usePreventNavigate',
    ]);
    expect([...NORETURN_HOOK]).toEqual(['useVisibleTask', 'useTask']);
    expect([...SIGNAL_HOOK_TYPES]).toEqual([
      'useSignal',
      'useStore',
      'useComputed',
      'useAsyncComputed',
      'useContext',
    ]);
  });
});
