export const FILTERS = {
  active: (item: { completed: boolean }) => !item.completed,
};
