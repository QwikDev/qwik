import { createContextId, type Signal } from '@qwik.dev/core';

export type DataMode = 'resolved' | 'empty' | 'error';
export type MotionDensity = 'calm' | 'elevated';
export type LayoutMode = 'grid' | 'stack';
export type SurfaceIntensity = 'soft' | 'balanced' | 'surge';

export interface LabContextValue {
  presetId: Signal<string>;
  dataMode: Signal<DataMode>;
  motionDensity: Signal<MotionDensity>;
  layoutMode: Signal<LayoutMode>;
  surfaceIntensity: Signal<SurfaceIntensity>;
  interactionCount: Signal<number>;
  requestCycle: Signal<number>;
  lastAction: Signal<string>;
}

export const LabContext = createContextId<LabContextValue>('playground.lab-context');
