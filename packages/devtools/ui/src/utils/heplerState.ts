import { DomContainer } from '@qwik.dev/core/internal';
import { htmlContainer } from './location';

export function getVnodeById(id: string | number) {
  let VnodeId: number;
  if (typeof id === 'string') {
    VnodeId = Number(id) * 2 + 1;
  } else {
    VnodeId = id * 2 + 1;
  }
  if (Number.isNaN(VnodeId)) {
    return null;
  }
  const container = htmlContainer()! as DomContainer;
  const rawStateData = (container as any).$rawStateData$ as unknown[] | undefined;
  return rawStateData?.[VnodeId] ?? null;
}

export function getIndexByObject(obj: unknown) {
  if (typeof obj !== 'object') {
    return null;
  }
  const container = htmlContainer()! as DomContainer;
  const rawStateData = (container as any).$rawStateData$ as unknown[] | undefined;
  const index = rawStateData?.findIndex((item: unknown) => item === obj) ?? -1;
  if (index === -1) {
    return null;
  }
  return (index - 1) / 2;
}
