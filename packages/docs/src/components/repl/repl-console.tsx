import { component$, Host } from '@builder.io/qwik';
import type { ReplEvent, ReplStore } from './types';

export interface ReplConsoleProps {
  store: ReplStore;
}
export const ReplConsole = component$(({ store }: ReplConsoleProps) => {
  return (
    <Host class="detail-logs">
      {store.events.map((ev) => (
        <ReplLog log={ev} />
      ))}
    </Host>
  );
});

export function ReplLog({ log }: { log: ReplEvent }) {
  let elapsed = '';
  if (log.end) {
    elapsed = renderElapsed(log.end - log.start);
  }
  switch (log.kind) {
    case 'pause':
      return (
        <div class="line paused">
          <div class="content">⏸ Paused in SSR</div>
          {elapsed ? <div class="elapsed">{elapsed}</div> : null}
        </div>
      );
    case 'resume':
      return (
        <div class="line resumed">
          <div class="content">▶️ Resumed in client</div>
          {elapsed ? <div class="elapsed">{elapsed}</div> : null}
        </div>
      );
    case 'console-log':
    case 'console-debug':
    case 'console-error':
    case 'console-warn':
      return (
        <div class={`log ${log.kind}`}>
          <div class={`platform ${log.scope}`}>{log.scope}</div>
          <div class="content">{log.message}</div>
          {elapsed ? <div class="elapsed">{elapsed}</div> : null}
        </div>
      );
    case 'symbol':
      return (
        <div class={`log ${log.kind}`}>
          <div class={`platform ${log.scope}"`}>{log.scope}</div>
          <div class="content">{log.message}</div>
        </div>
      );
    case 'prefetch':
      return (
        <div class={`log ${log.kind}`}>
          <div class={`platform ${log.scope}"`}>{log.scope}</div>
          <div class="content">{log.message}</div>
        </div>
      );
    case 'client-module':
      return (
        <div class={`log ${log.kind}`}>
          <div class={`platform ${log.scope}"`}>{log.scope}</div>
          <div class="content">{log.message}</div>
        </div>
      );
  }
  return <div class=""></div>;
}

function renderElapsed(millis: number) {
  if (millis < 1000) {
    return `${millis.toFixed(1)}ms`;
  }
  return `${(millis / 1000).toFixed(2)}s`;
}
