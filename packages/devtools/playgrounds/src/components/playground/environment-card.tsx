import { component$, useComputed$, useContext, type Signal } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';
import { experimentPresets } from '~/content/playground-content';
import type { LabEvent } from '~/content/playground-types';
import { LabContext } from './lab-context';
import { PlaygroundGlyph } from './icons';

interface EnvironmentCardProps {
  serverTime: string;
  eventLog: Signal<LabEvent[]>;
}

export const EnvironmentCard = component$<EnvironmentCardProps>(({ serverTime, eventLog }) => {
  const lab = useContext(LabContext);
  const location = useLocation();

  const activePreset = useComputed$(
    () =>
      experimentPresets.find((preset) => preset.id === lab.presetId.value) ?? experimentPresets[1]
  );

  return (
    <div class="lab-panel">
      <div class="panel-heading">
        <div>
          <div class="panel-eyebrow">Environment Card</div>
          <h3>Route, context, and event signals compressed into one readable panel.</h3>
        </div>
        <div class="panel-chip">
          <PlaygroundGlyph class="panel-chip__icon" name="route" />
          {location.url.pathname}
        </div>
      </div>

      <div class="environment-grid">
        <div class="environment-item">
          <span>Server clock</span>
          <strong>{serverTime}</strong>
        </div>
        <div class="environment-item">
          <span>Previous route</span>
          <strong>{location.prevUrl?.pathname ?? 'First stop'}</strong>
        </div>
        <div class="environment-item">
          <span>Data mode</span>
          <strong>{lab.dataMode.value}</strong>
        </div>
        <div class="environment-item">
          <span>Layout mode</span>
          <strong>{lab.layoutMode.value}</strong>
        </div>
        <div class="environment-item">
          <span>Motion density</span>
          <strong>{lab.motionDensity.value}</strong>
        </div>
        <div class="environment-item">
          <span>Preset tone</span>
          <strong>{activePreset.value.tone}</strong>
        </div>
      </div>

      <div class="event-stream">
        <div class="event-stream__header">
          <span>Recent events</span>
          <span>{lab.lastAction.value}</span>
        </div>
        <div class="event-list">
          {eventLog.value.map((event) => (
            <div class={`event-card event-card--${event.tone}`} key={event.id}>
              <div class="event-card__meta">
                <span>{event.time}</span>
                <span>{event.label}</span>
              </div>
              <div class="event-card__detail">{event.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
