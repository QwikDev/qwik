import { component$, useStyles$ } from '@builder.io/qwik';
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
    <div class="panel-toggle">
      {props.panelStore.list.map((p) => (
        <button
          key={p}
          onClick$={() => {
            props.panelStore.active = p;
          }}
          type="button"
          preventdefault:click
          class={{ active: props.panelStore.active === p }}
        >
          {p}
        </button>
      ))}
    </div>
  );
});
