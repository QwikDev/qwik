import { component$, useStyles$ } from '@qwik.dev/core';
import styles from './panel-toggle.css?inline';

export interface PanelToggleProps {
  panelStore: {
    active: string;
    list: string[];
  };
}

export const PanelToggle = component$((props: PanelToggleProps) => {
  useStyles$(styles);

  return (
    <div
      class={{
        'panel-toggle': true,
        'grid-cols-4': props.panelStore.list.length === 4,
        'grid-cols-3': props.panelStore.list.length === 3,
      }}
    >
      {props.panelStore.list.map((p) => (
        <button
          key={p}
          onClick$={() => {
            props.panelStore.active = p;
          }}
          type="button"
          preventdefault:click
          class={{
            'underlined-tab': true,
            active: props.panelStore.active === p,
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
});
