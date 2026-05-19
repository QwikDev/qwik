import { component$, jsx } from '@qwik.dev/core';
import type { ReplEvent, ReplStore } from '../types';

type ConsoleEntry =
  | { type: 'event'; event: ReplEvent }
  | { type: 'linked-console'; source: ReplEvent; value: ReplEvent };

export interface ReplConsoleProps {
  store: ReplStore;
}

export const ReplConsole = component$(({ store }: ReplConsoleProps) => {
  const visibleEvents = store.events.filter((event) => event.scope !== 'build');
  const entries = createConsoleEntries(visibleEvents);

  return (
    <div class="detail-logs">
      {entries.length === 0 ? (
        <div class="console-empty-state">
          <p class="console-empty-title">No console activity yet</p>
          <p class="console-empty-copy">
            Interact with the app or trigger a render to see client and SSR messages here.
          </p>
        </div>
      ) : (
        <div class="console-log-list">
          {entries.map((entry, i) => (
            <ReplLog entry={entry} key={i} />
          ))}
        </div>
      )}
    </div>
  );
});

export function ReplLog({ entry }: { entry: ConsoleEntry }) {
  if (entry.type === 'linked-console') {
    const elapsed = entry.value.end ? renderElapsed(entry.value.end - entry.value.start) : '';

    return (
      <article
        class={[
          'console-log-entry',
          'console-log-linked',
          `console-kind-${entry.value.kind.replace('console-', '')}`,
        ]}
      >
        <div class="console-log-linked-block">
          <div class="console-log-inline console-log-linked-source">
            <span class="console-source-meta">from</span>
            <code class="console-context-value">{basename(entry.source.message.join(' '))}</code>
          </div>
          <div class="console-log-inline console-log-linked-message">
            <span class={['console-platform', entry.value.scope]}>
              {getScopeLabel(entry.value.scope)}
            </span>
            {entry.value.kind !== 'console-log' ? (
              <span class="console-kind-badge">{getConsoleKindLabel(entry.value.kind)}</span>
            ) : null}
            <span class="console-message-inline console-message-linked-value">
              {renderConsoleMessage(entry.value.message)}
            </span>
            {elapsed ? <span class="console-elapsed">{elapsed}</span> : null}
          </div>
        </div>
      </article>
    );
  }

  const log = entry.event;
  const elapsed = log.end ? renderElapsed(log.end - log.start) : '';

  if (log.scope === 'build') {
    return null;
  }

  switch (log.kind) {
    case 'pause':
      return (
        <article class={['console-log-entry', 'console-log-state', 'console-log-paused']}>
          <div class="console-log-inline">
            <span class={['console-platform', 'ssr']}>SSR</span>
            <span class="console-kind-badge">Paused</span>
            <span class="console-message-inline">Execution paused in the server render.</span>
          </div>
        </article>
      );

    case 'resume':
      return (
        <article class={['console-log-entry', 'console-log-state', 'console-log-resumed']}>
          <div class="console-log-inline">
            <span class={['console-platform', 'client']}>Client</span>
            <span class="console-kind-badge">Resumed</span>
            <span class="console-message-inline">Execution resumed in the client.</span>
            {elapsed ? <span class="console-elapsed">{elapsed}</span> : null}
          </div>
        </article>
      );

    case 'console-log':
    case 'console-debug':
    case 'console-error':
    case 'console-warn':
      return (
        <article
          class={[
            'console-log-entry',
            'console-log-message',
            `console-kind-${log.kind.replace('console-', '')}`,
          ]}
        >
          <div class="console-log-inline">
            <span class={['console-platform', log.scope]}>{getScopeLabel(log.scope)}</span>
            {log.kind !== 'console-log' ? (
              <span class="console-kind-badge">{getConsoleKindLabel(log.kind)}</span>
            ) : null}
            <span class="console-message-inline">{renderConsoleMessage(log.message)}</span>
            {elapsed ? <span class="console-elapsed">{elapsed}</span> : null}
          </div>
        </article>
      );

    case 'symbol':
      return (
        <article class={['console-log-entry', 'console-log-symbol']}>
          <div class="console-log-inline">
            <span class={['console-platform', log.scope]}>{getScopeLabel(log.scope)}</span>
            <span class="console-kind-badge">Symbol</span>
            <code class="console-context-value">{basename(log.message.join(' '))}</code>
          </div>
        </article>
      );

    case 'prefetch':
      return (
        <article class={['console-log-entry', 'console-log-prefetch']}>
          <div class="console-log-inline">
            <span class={['console-platform', log.scope]}>{getScopeLabel(log.scope)}</span>
            <span class="console-kind-badge">Prefetch</span>
            <span class="console-message-inline">{log.message.join(' ')}</span>
          </div>
        </article>
      );

    case 'client-module':
      return (
        <article class={['console-log-entry', 'console-log-module']}>
          <div class="console-log-inline">
            <span class={['console-platform', log.scope]}>{getScopeLabel(log.scope)}</span>
            <span class="console-kind-badge">Module</span>
            <code class="console-context-value">{basename(log.message.join(' '))}</code>
          </div>
        </article>
      );
  }

  return null;
}

const styleprefix = '%c';

function renderConsoleMessage(texts: string[]) {
  const nodes: any[] = [];
  for (let i = 0; i < texts.length; i++) {
    const msg = texts[i];
    if (msg.startsWith(styleprefix)) {
      nodes.push(jsx('span', { style: texts[i + 1], children: msg.slice(styleprefix.length) }));
      i++;
    } else {
      nodes.push(i === 0 ? msg : ` ${msg}`);
    }
  }
  return nodes;
}

function createConsoleEntries(events: ReplEvent[]): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const nextEvent = events[i + 1];

    if (
      event.kind === 'symbol' &&
      nextEvent &&
      isConsoleMessage(nextEvent) &&
      nextEvent.scope === event.scope
    ) {
      entries.push({
        type: 'linked-console',
        source: event,
        value: nextEvent,
      });
      i++;
      continue;
    }

    entries.push({ type: 'event', event });
  }

  return entries;
}

function isConsoleMessage(event: ReplEvent) {
  return (
    event.kind === 'console-log' ||
    event.kind === 'console-debug' ||
    event.kind === 'console-error' ||
    event.kind === 'console-warn'
  );
}

function basename(str: string) {
  const normalized = str.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  if (index > 0) {
    return normalized.slice(index + 1);
  }
  return normalized;
}

function getScopeLabel(scope: ReplEvent['scope']) {
  if (scope === 'ssr') {
    return 'SSR';
  }
  if (scope === 'client') {
    return 'Client';
  }
  return scope;
}

function getConsoleKindLabel(kind: ReplEvent['kind']) {
  switch (kind) {
    case 'console-error':
      return 'Error';
    case 'console-warn':
      return 'Warn';
    case 'console-debug':
      return 'Debug';
    case 'console-log':
    default:
      return 'Log';
  }
}

function renderElapsed(millis: number) {
  if (millis < 1000) {
    return `${millis.toFixed(1)}ms`;
  }
  return `${(millis / 1000).toFixed(2)}s`;
}
