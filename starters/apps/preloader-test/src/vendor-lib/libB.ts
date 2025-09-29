// This will be in its own chunk
import { helper } from "./helper";

export const getMessage = () => {
  return `Message from LibB: ${helper()}`;
};
