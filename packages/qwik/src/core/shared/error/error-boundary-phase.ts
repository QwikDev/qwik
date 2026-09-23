/** Identifies where an error caught by an error boundary originated. @public @experimental */
export const enum ErrorBoundaryPhase {
  Render = 'render',
  Event = 'event',
  Hook = 'hook',
}
