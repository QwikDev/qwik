import { configureCache, defineCacheConfig } from '@qwik.dev/router/cache';
import { AlertPanel } from './routes/alert-panel';
import {
  getAlerts,
  getAuditSummary,
  getCustomers,
  getRevenue,
  getTenantContext,
} from './routes/dashboard.server';
import { CustomerCard, RevenueCard } from './routes/kpi-card';

export const cacheConfig = defineCacheConfig({
  defaults: {
    resources: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-dashboard-resource',
    },
    components: {
      store: 'memory',
      scope: 'private',
      dedupe: true,
      namespace: 'qwik-dashboard-component',
    },
  },
  optimize: {
    resources: {
      getTenantContext: {
        target: getTenantContext,
        policy: 'privateTenant',
      },
      getRevenue: {
        target: getRevenue,
        policy: 'privateMetric',
        serialize: 'value',
        vary: [getTenantContext],
      },
      getCustomers: {
        target: getCustomers,
        policy: 'privateMetric',
        serialize: 'value',
        vary: [getTenantContext],
      },
      getAlerts: {
        target: getAlerts,
        policy: 'privateAlerts',
        vary: [getTenantContext],
      },
      getAuditSummary: {
        target: getAuditSummary,
        policy: 'privateAudit',
        vary: [getTenantContext],
      },
    },
    components: {
      RevenueCard: {
        target: RevenueCard,
        policy: 'privateDashboardCard',
        vary: [getTenantContext, getRevenue],
      },
      CustomerCard: {
        target: CustomerCard,
        policy: 'privateDashboardCard',
        vary: [getTenantContext, getCustomers],
      },
      AlertPanel: {
        target: AlertPanel,
        policy: 'privateDashboardPanel',
        vary: [getTenantContext, getAlerts, getAuditSummary],
      },
    },
  },
});

configureCache(cacheConfig);
