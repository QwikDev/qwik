import tutorialSections from '@tutorial-data';
import { component$ } from '@builder.io/qwik';
import type { TutorialStore } from './layout';

export const TutorialContentHeader = component$(({ store }: TutorialContentHeaderProps) => {
  return (
    <div class="content-header">
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path
          d="M5 6h14M5 12h14M5 18h14"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>

      <select
        onChange$={(_, elm: any) => {
          if (location.pathname !== elm.value) {
            location.href = `/tutorial/${elm.value}/`;
          }
        }}
      >
        {(tutorialSections as Tutorial[]).map((s, key) => (
          <optgroup key={key} label={s.title}>
            {s.apps.map((t) => (
              <option selected={t.id === store.appId} value={t.id} key={t.id}>
                {t.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <h1>{store.app.title}</h1>
    </div>
  );
});

interface Tutorial {
  title: string;
  apps: { id: string; title: string }[];
}

interface TutorialContentHeaderProps {
  store: TutorialStore;
}
