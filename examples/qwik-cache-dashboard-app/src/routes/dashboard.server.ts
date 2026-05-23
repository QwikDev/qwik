import { server$ } from '@qwik.dev/router';

export type TenantInput = {
  tenantId: string;
  range: '7d' | '30d';
  runId?: string;
  delayMs?: number;
};

const revenueReads = new Map<string, number>();
const customerReads = new Map<string, number>();

export const getTenantContext = server$(async function (input?: Partial<TenantInput>) {
  const headerTenant = (this as any)?.request?.headers?.get('x-tenant-id');
  const headerRole = (this as any)?.request?.headers?.get('x-user-role');
  const tenantId = headerTenant || input?.tenantId || 'acme';
  const role = headerRole === 'admin' ? 'admin' : 'operator';
  return {
    tenantId,
    role,
    privateKey: `${tenantId}:${role}`,
  };
});

export const getRevenue = server$(async function (input: TenantInput) {
  const tenant = await getTenantContext(input);
  await delay(input.delayMs ?? 30);
  const key = `${input.runId ?? 'dashboard'}:${tenant.privateKey}:${input.range}:revenue`;
  const reads = (revenueReads.get(key) ?? 0) + 1;
  revenueReads.set(key, reads);
  const base = input.range === '30d' ? 124800 : 32750;
  return {
    kind: 'revenue',
    tenantId: tenant.tenantId,
    range: input.range,
    amount: tenant.role === 'admin' ? base : Math.round(base * 0.92),
    reads,
  };
});

export const getCustomers = server$(async function (input: TenantInput) {
  const tenant = await getTenantContext(input);
  await delay(input.delayMs ?? 30);
  const key = `${input.runId ?? 'dashboard'}:${tenant.privateKey}:${input.range}:customers`;
  const reads = (customerReads.get(key) ?? 0) + 1;
  customerReads.set(key, reads);
  return {
    kind: 'customers',
    tenantId: tenant.tenantId,
    active: input.range === '30d' ? 428 : 151,
    churnRisk: tenant.role === 'admin' ? 18 : 12,
    reads,
  };
});

export const getAlerts = server$(async function (input: TenantInput) {
  const tenant = await getTenantContext(input);
  await delay(input.delayMs ?? 25);
  return {
    kind: 'alerts',
    tenantId: tenant.tenantId,
    items:
      tenant.role === 'admin'
        ? ['Contract renewal due', 'Usage spike in workspace analytics', 'New admin invite']
        : ['Usage spike in workspace analytics', 'Support queue over target'],
  };
});

export const getAuditSummary = server$(async function (input: TenantInput) {
  const tenant = await getTenantContext(input);
  await delay(input.delayMs ?? 20);
  return {
    kind: 'audit',
    tenantId: tenant.tenantId,
    visibleEvents: tenant.role === 'admin' ? 12 : 4,
  };
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
