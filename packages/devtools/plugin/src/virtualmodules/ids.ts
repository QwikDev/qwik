export function normalizeVirtualModuleId(id: string): string {
  return id.split('?')[0].split('#')[0];
}

export function getVirtualIdVariations(id: string): string[] {
  return [id, `/${id}`, `\u0000${id}`, `/@id/${id}`];
}

export function isVirtualModuleRequest(requestId: string, virtualModuleId: string): boolean {
  return getVirtualIdVariations(virtualModuleId).includes(normalizeVirtualModuleId(requestId));
}

export function toResolvedVirtualModuleId(id: string): string {
  return `/${id}`;
}
