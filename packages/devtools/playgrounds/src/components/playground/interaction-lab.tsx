import { $, component$, useComputed$, useContextProvider, useSignal } from '@qwik.dev/core';
import { useNavigate } from '@qwik.dev/router';
import { experimentPresets, initialLabEvents } from '~/content/playground-content';
import type { LabEvent } from '~/content/playground-types';
import { AsyncStatePanel } from './async-state-panel';
import { EnvironmentCard } from './environment-card';
import {
  LabContext,
  type DataMode,
  type LayoutMode,
  type MotionDensity,
  type SurfaceIntensity,
} from './lab-context';
import { PlaygroundGlyph } from './icons';

interface InteractionLabProps {
  serverTime: string;
}

function createLabEvent(label: string, detail: string, tone: LabEvent['tone'] = 'info'): LabEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label,
    detail,
    time: new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date()),
    tone,
  };
}

export const InteractionLab = component$<InteractionLabProps>(({ serverTime }) => {
  const navigate = useNavigate();
  const presetId = useSignal(experimentPresets[1].id);
  const dataMode = useSignal<DataMode>('resolved');
  const motionDensity = useSignal<MotionDensity>('elevated');
  const layoutMode = useSignal<LayoutMode>('grid');
  const surfaceIntensity = useSignal<SurfaceIntensity>('balanced');
  const interactionCount = useSignal(4);
  const requestCycle = useSignal(0);
  const lastAction = useSignal('Ready to inspect live state.');
  const eventLog = useSignal(initialLabEvents.map((event) => ({ ...event })));

  useContextProvider(LabContext, {
    presetId,
    dataMode,
    motionDensity,
    layoutMode,
    surfaceIntensity,
    interactionCount,
    requestCycle,
    lastAction,
  });

  const activePreset = useComputed$(
    () => experimentPresets.find((preset) => preset.id === presetId.value) ?? experimentPresets[1]
  );

  const activityIndex = useComputed$(() => {
    const intensityBoost =
      surfaceIntensity.value === 'surge' ? 22 : surfaceIntensity.value === 'balanced' ? 14 : 8;
    const dataBoost = dataMode.value === 'error' ? 11 : dataMode.value === 'empty' ? 6 : 15;
    return interactionCount.value * 9 + intensityBoost + dataBoost;
  });

  const applyPreset = $((id: string) => {
    const preset = experimentPresets.find((item) => item.id === id);
    if (!preset) {
      return;
    }

    presetId.value = id;
    requestCycle.value++;
    lastAction.value = `${preset.label} preset armed.`;
    eventLog.value = [
      createLabEvent(
        'Preset updated',
        `${preset.label} now drives synthetic latency at ${preset.latencyMs}ms.`,
        'success'
      ),
      ...eventLog.value,
    ].slice(0, 6);
  });

  const applyDataMode = $((nextMode: DataMode) => {
    dataMode.value = nextMode;
    requestCycle.value++;
    lastAction.value = `Scenario switched to ${nextMode}.`;
    eventLog.value = [
      createLabEvent(
        'Scenario changed',
        `The resource panel is now rendering the ${nextMode} branch.`,
        nextMode === 'error' ? 'warning' : 'info'
      ),
      ...eventLog.value,
    ].slice(0, 6);
  });

  const applyMotion = $((nextMotion: MotionDensity) => {
    motionDensity.value = nextMotion;
    lastAction.value = `Motion set to ${nextMotion}.`;
    eventLog.value = [
      createLabEvent(
        'Motion density',
        `${nextMotion} motion keeps the stage transitions deliberate.`
      ),
      ...eventLog.value,
    ].slice(0, 6);
  });

  const applyLayout = $((nextLayout: LayoutMode) => {
    layoutMode.value = nextLayout;
    lastAction.value = `Layout switched to ${nextLayout}.`;
    eventLog.value = [
      createLabEvent('Layout updated', `${nextLayout} mode rearranged the experiment surface.`),
      ...eventLog.value,
    ].slice(0, 6);
  });

  const applySurface = $((nextSurface: SurfaceIntensity) => {
    surfaceIntensity.value = nextSurface;
    lastAction.value = `Surface intensity set to ${nextSurface}.`;
    eventLog.value = [
      createLabEvent(
        'Surface tuned',
        `${nextSurface} intensity changed the overall command-center mood.`,
        'success'
      ),
      ...eventLog.value,
    ].slice(0, 6);
  });

  const nudgeInteraction = $((delta: number) => {
    interactionCount.value = Math.max(1, interactionCount.value + delta);
    requestCycle.value++;
    lastAction.value = `Interaction volume is now ${interactionCount.value}.`;
    eventLog.value = [
      createLabEvent(
        'Interaction count',
        `Signal load adjusted to ${interactionCount.value} interactions.`
      ),
      ...eventLog.value,
    ].slice(0, 6);
  });

  const triggerAsync = $(() => {
    requestCycle.value++;
    lastAction.value = 'Synthetic resource refresh triggered.';
    eventLog.value = [
      createLabEvent(
        'Async refresh',
        `Queued request cycle ${requestCycle.value + 1} for the active preset.`,
        'success'
      ),
      ...eventLog.value,
    ].slice(0, 6);
  });

  const simulateNavigation = $(async () => {
    const target = requestCycle.value % 2 === 0 ? '/about' : '/blog';
    lastAction.value = `Navigating to ${target}.`;
    eventLog.value = [
      createLabEvent(
        'Route jump',
        `Quick action opened ${target} to test cross-route continuity.`,
        'warning'
      ),
      ...eventLog.value,
    ].slice(0, 6);
    await navigate(target);
  });

  const resetLab = $(() => {
    presetId.value = experimentPresets[1].id;
    dataMode.value = 'resolved';
    motionDensity.value = 'elevated';
    layoutMode.value = 'grid';
    surfaceIntensity.value = 'balanced';
    interactionCount.value = 4;
    requestCycle.value++;
    lastAction.value = 'Lab reset to the default observation profile.';
    eventLog.value = [
      createLabEvent(
        'Lab reset',
        'Default observation profile restored for a clean pass.',
        'success'
      ),
      ...initialLabEvents.slice(0, 2).map((event) => ({ ...event })),
    ];
  });

  return (
    <div
      class={{
        'lab-shell': true,
        'lab-shell--stack': layoutMode.value === 'stack',
        'lab-shell--surge': surfaceIntensity.value === 'surge',
        'lab-shell--soft': surfaceIntensity.value === 'soft',
        'lab-shell--calm': motionDensity.value === 'calm',
      }}
    >
      <div class="lab-panel lab-panel--controls">
        <div class="panel-heading">
          <div>
            <div class="panel-eyebrow">Live Experiment Panel</div>
            <h3>Controls inspired by modern playgrounds, tuned for Qwik state visibility.</h3>
          </div>
          <div class="panel-chip">
            <PlaygroundGlyph class="panel-chip__icon" name="spark" />
            {activePreset.value.label}
          </div>
        </div>

        <div class="metric-strip">
          <div class="metric-card">
            <span>Activity index</span>
            <strong>{activityIndex.value}</strong>
          </div>
          <div class="metric-card">
            <span>Latency</span>
            <strong>{activePreset.value.latencyMs}ms</strong>
          </div>
          <div class="metric-card">
            <span>Cycles queued</span>
            <strong>{requestCycle.value + 1}</strong>
          </div>
        </div>

        <div class="control-grid">
          <div class="control-group">
            <div class="control-title">Latency preset</div>
            <div class="segmented-row">
              {experimentPresets.map((preset) => (
                <button
                  key={preset.id}
                  class={{
                    'segment-button': true,
                    'segment-button--active': presetId.value === preset.id,
                  }}
                  onClick$={() => applyPreset(preset.id)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div class="control-group">
            <div class="control-title">Data state</div>
            <div class="segmented-row">
              {(['resolved', 'empty', 'error'] as const).map((mode) => (
                <button
                  key={mode}
                  class={{
                    'segment-button': true,
                    'segment-button--active': dataMode.value === mode,
                  }}
                  onClick$={() => applyDataMode(mode)}
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div class="control-group">
            <div class="control-title">Surface intensity</div>
            <div class="segmented-row">
              {(['soft', 'balanced', 'surge'] as const).map((surface) => (
                <button
                  key={surface}
                  class={{
                    'segment-button': true,
                    'segment-button--active': surfaceIntensity.value === surface,
                  }}
                  onClick$={() => applySurface(surface)}
                  type="button"
                >
                  {surface}
                </button>
              ))}
            </div>
          </div>

          <div class="control-group">
            <div class="control-title">Motion density</div>
            <div class="segmented-row">
              {(['elevated', 'calm'] as const).map((motion) => (
                <button
                  key={motion}
                  class={{
                    'segment-button': true,
                    'segment-button--active': motionDensity.value === motion,
                  }}
                  onClick$={() => applyMotion(motion)}
                  type="button"
                >
                  {motion}
                </button>
              ))}
            </div>
          </div>

          <div class="control-group">
            <div class="control-title">Card layout</div>
            <div class="segmented-row">
              {(['grid', 'stack'] as const).map((layout) => (
                <button
                  key={layout}
                  class={{
                    'segment-button': true,
                    'segment-button--active': layoutMode.value === layout,
                  }}
                  onClick$={() => applyLayout(layout)}
                  type="button"
                >
                  {layout}
                </button>
              ))}
            </div>
          </div>

          <div class="control-group">
            <div class="control-title">Signal volume</div>
            <div class="stepper-row">
              <button class="mini-button" onClick$={() => nudgeInteraction(-1)} type="button">
                -
              </button>
              <span>{interactionCount.value}</span>
              <button class="mini-button" onClick$={() => nudgeInteraction(1)} type="button">
                +
              </button>
            </div>
          </div>
        </div>

        <div class="quick-actions">
          <button
            class="action-button action-button--primary"
            onClick$={triggerAsync}
            type="button"
          >
            Trigger async load
          </button>
          <button class="action-button" onClick$={simulateNavigation} type="button">
            Simulate navigation
          </button>
          <button class="action-button" onClick$={resetLab} type="button">
            Reset lab state
          </button>
        </div>
      </div>

      <div class="lab-grid">
        <AsyncStatePanel />
        <EnvironmentCard eventLog={eventLog} serverTime={serverTime} />
      </div>
    </div>
  );
});
