import type { IntegrationData, IntegrationType } from 'packages/qwik/src/cli/types';
import { loadIntegrations } from 'packages/qwik/src/cli/utils/integrations';

type Result = {
  templates: IntegrationData[];
  baseApp: IntegrationData;
  libraryApp: IntegrationData;
};

export async function loadTemplates(type: IntegrationType): Promise<Result> {
  const integrations = await loadIntegrations();
  const templates = integrations.filter((i) => i.type === type);

  return {
    templates,
    baseApp: templates.find((a) => a.id === 'base')!,
    libraryApp: templates.find((a) => a.id === 'library')!,
  };
}
