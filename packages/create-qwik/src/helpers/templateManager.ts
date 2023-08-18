import type { IntegrationData, IntegrationType } from 'packages/qwik/src/cli/types';
import { loadIntegrations } from 'packages/qwik/src/cli/utils/integrations';

let integrations: IntegrationData[] | undefined = undefined;

const LIBRARY_ID = 'library';
const BASE_ID = 'base';

class AppNotFoundError extends Error {
  constructor(id: string, templates: IntegrationData[]) {
    super();

    this.message = `Invalid app id "${id}". It can only be one of${templates.map(
      (app) => ` "${app.id}"`
    )}.`;
  }
}

export const makeTemplateManager = async (type: IntegrationType) => {
  if (!integrations) {
    integrations = await loadIntegrations();
  }

  const templates = integrations.filter((i) => i.type === type);

  function getAppById(id: string): IntegrationData | undefined {
    return templates.find((t) => t.id === id);
  }

  function getBaseApp(): IntegrationData | undefined {
    return getAppById(BASE_ID);
  }

  function getBootstrapApps(id: string): {
    baseApp: IntegrationData;
    starterApp?: IntegrationData;
  } {
    const isLibrary = id === LIBRARY_ID;

    if (isLibrary) {
      const libApp = getAppById(id);

      if (!libApp) {
        throw new AppNotFoundError(id, templates);
      }

      return { baseApp: libApp };
    }

    const baseApp = getAppById(BASE_ID);
    const starterApp = getAppById(id);

    if (!baseApp) {
      throw new AppNotFoundError(BASE_ID, templates);
    }

    if (!starterApp) {
      throw new AppNotFoundError(id, templates);
    }

    return { baseApp, starterApp };
  }

  return {
    templates,
    getAppById,
    getBootstrapApps,
    getBaseApp,
  };
};

export type TemplateManager = Awaited<ReturnType<typeof makeTemplateManager>>;
