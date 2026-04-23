import { Resource, component$, useComputed$, useContext, useResource$ } from '@qwik.dev/core';
import { experimentPresets } from '~/content/playground-content';
import { LabContext } from './lab-context';
import { PlaygroundGlyph } from './icons';

interface SyntheticPayload {
  phase: 'resolved' | 'empty';
  requestId: string;
  summary: string;
  sample: string;
  edges: number;
  latencyMs: number;
}

export const AsyncStatePanel = component$(() => {
  const lab = useContext(LabContext);

  const activePreset = useComputed$(
    () =>
      experimentPresets.find((preset) => preset.id === lab.presetId.value) ?? experimentPresets[1]
  );

  const snapshot = useResource$<SyntheticPayload>(async ({ track }) => {
    const presetId = track(() => lab.presetId.value);
    const dataMode = track(() => lab.dataMode.value);
    const interactions = track(() => lab.interactionCount.value);
    const requestCycle = track(() => lab.requestCycle.value);
    const preset = experimentPresets.find((item) => item.id === presetId) ?? experimentPresets[1];

    await new Promise((resolve) => setTimeout(resolve, preset.latencyMs));

    if (dataMode === 'error') {
      throw new Error(
        `Synthetic failure injected on cycle ${requestCycle + 1} under ${preset.label}.`
      );
    }

    if (dataMode === 'empty') {
      return {
        phase: 'empty',
        requestId: `lab-${requestCycle + 1}`,
        summary: 'No payload returned for the current scenario filter.',
        sample: 'Try switching to resolved or change the latency preset.',
        edges: 0,
        latencyMs: preset.latencyMs,
      };
    }

    return {
      phase: 'resolved',
      requestId: `lab-${requestCycle + 1}`,
      summary: `${preset.label} completed with a stable synthetic payload.`,
      sample: `${interactions * 4} signal edges and route-ready metadata were packed into the current response.`,
      edges: interactions * 4,
      latencyMs: preset.latencyMs,
    };
  });

  return (
    <div class="lab-panel">
      <div class="panel-heading">
        <div>
          <div class="panel-eyebrow">Async State Panel</div>
          <h3>Resource lifecycle with visible pending, empty, and failure modes.</h3>
        </div>
        <div class="panel-chip">
          <PlaygroundGlyph class="panel-chip__icon" name="pulse" />
          {activePreset.value.label}
        </div>
      </div>

      <Resource
        value={snapshot}
        onPending={() => (
          <div class="resource-card resource-card--pending">
            <div class="resource-signal" />
            <div class="resource-copy">
              <div class="resource-title">Awaiting synthetic payload...</div>
              <div class="resource-body">
                Holding for {activePreset.value.latencyMs}ms to make the pending state inspectable
                in devtools.
              </div>
            </div>
          </div>
        )}
        onRejected={(error) => (
          <div class="resource-card resource-card--error">
            <div class="resource-state">Failure branch</div>
            <div class="resource-title">{error.message}</div>
            <div class="resource-body">
              The UI footprint stays stable so that failure remains visually comparable to resolved
              states.
            </div>
          </div>
        )}
        onResolved={(payload) => (
          <div
            class={{
              'resource-card': true,
              'resource-card--empty': payload.phase === 'empty',
              'resource-card--resolved': payload.phase === 'resolved',
            }}
          >
            <div class="resource-state">
              {payload.phase === 'empty' ? 'Empty branch' : 'Resolved branch'}
            </div>
            <div class="resource-title">{payload.summary}</div>
            <div class="resource-body">{payload.sample}</div>
            <div class="resource-stats">
              <div>
                <span>Request</span>
                <strong>{payload.requestId}</strong>
              </div>
              <div>
                <span>Edges</span>
                <strong>{payload.edges}</strong>
              </div>
              <div>
                <span>Latency</span>
                <strong>{payload.latencyMs}ms</strong>
              </div>
            </div>
          </div>
        )}
      />
    </div>
  );
});
