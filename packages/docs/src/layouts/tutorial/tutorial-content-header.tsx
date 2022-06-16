import tutorialSections, { TutorialApp } from '@tutorial-data';
import { component$, useHostElement } from '@builder.io/qwik';

export const TutorialContentHeader = component$(({ current }: TutorialContentHeaderProps) => {
  //const loc = useLocation();
  const host = useHostElement();

  return (
    <div class="content-header">
      <svg width="24" height="24">
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
          const loc = host.ownerDocument.location;
          if (loc.pathname !== elm.value) {
            loc.href = `/tutorial/${elm.value}`;
          }
        }}
      >
        {tutorialSections.map((s) => (
          <optgroup label={s.title}>
            {s.apps.map((t) => (
              <option selected={t.id === current.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <h1>{current.title}</h1>
    </div>
  );
});

interface TutorialContentHeaderProps {
  current: TutorialApp;
}
