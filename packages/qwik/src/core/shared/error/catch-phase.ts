/** Identifies where an error caught by an error boundary originated. @public @experimental */
export const enum CatchPhase {
  Render = 'render',
  Event = 'event',
  Hook = 'hook',
}
