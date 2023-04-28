import { component$ } from '@builder.io/qwik';
import { useContent } from '@builder.io/qwik-city';

export const IntegrationsList = component$(() => {
  const { menu } = useContent();

  const integrations = menu?.items?.find((item) => item.text === 'Integrations')?.items;

  return (
    <ul>
      {integrations?.map((integration) => {
        return (
          <li key={integration.text}>
            <a href={integration.href}>{integration.text}</a>
          </li>
        );
      })}
    </ul>
  );
});
