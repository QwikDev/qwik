/* eslint-disable no-console */
/** @jsxImportSource @qwik.dev/core */

import { component$, sync$, useOnDocument } from '@qwik.dev/core';

/**
 * Use this with dev-server.ts. It captures errors and
 *
 * - Captures unhandled promise rejections
 * - Captures global errors via the `error` event listener
 * - Formats error messages with filename and line number information
 * - Sends the captured logs back to the server using `navigator.sendBeacon` to the `/__log` endpoint
 */
export const LogConsole = component$(() => {
  useOnDocument(
    'qinit',
    sync$(() => {
      const send = (type: string, message: string) => {
        navigator.sendBeacon('/__log', `[${type} ${location.pathname}] ${message}`);
      };
      for (const type of ['log', 'warn', 'error'] as const) {
        const original = console[type];
        console[type] = (...args: unknown[]) => {
          send(type, args.join(' '));
          original(...args);
        };
      }
      window.addEventListener('error', (e) => {
        send('ErrorEvent', e.message + ' at ' + e.filename + ':' + e.lineno + ':' + e.colno);
      });
      window.addEventListener('unhandledrejection', (e) => {
        send(
          'PromiseRejectionEvent',
          (e.reason?.stack || e.reason?.message || e.reason) +
            (e.reason?.cause ? ' Caused by: ' + e.reason.cause : '')
        );
      });
      // Uncomment to verify that the log capture is working correctly
      // send('LogConsole', 'Initialized log capture');
    })
  );
  return null;
});
