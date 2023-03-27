export const getTasksFromDB = () => {
  return null! as Task[];
};
export const hasText = (task: Task, text: string) => true;
export interface Task {
  id: string;
  completed: boolean;
  title: string;
}
