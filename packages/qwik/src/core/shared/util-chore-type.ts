export const enum ChoreType {
  /// MASKS defining three levels of sorting
  MACRO /* **************************** */ = 240,
  /* order of elements (not encoded here) */
  MICRO /* **************************** */ = 15,

  /** Ensure that the QRL promise is resolved before processing next chores in the queue */
  QRL_RESOLVE /* ********************** */ = 1,
  RUN_QRL,
  TASK,
  NODE_DIFF,
  NODE_PROP,
  COMPONENT,
  RECOMPUTE_AND_SCHEDULE_EFFECTS,
  // Next macro level
  VISIBLE /* ************************** */ = 16,
  // Next macro level
  CLEANUP_VISIBLE /* ****************** */ = 32,
  // Next macro level
  WAIT_FOR_QUEUE /* ********************** */ = 255,
}
