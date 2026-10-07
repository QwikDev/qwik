import { z } from 'zod';

export const pageInput = z.object({ url: z.string().url().optional() });
export const inspectInput = pageInput.extend({
  selector: z.string().min(1).optional(),
  includeHtml: z.boolean().default(false),
  includeSignalValues: z.boolean().default(false),
  includeSerializedState: z.boolean().default(false),
  includeSerializedVNodeTree: z.boolean().default(false),
  offset: z.number().int().nonnegative().safe().default(0),
});
export type InspectInput = z.input<typeof inspectInput>;
export const locateInput = pageInput.extend({ selector: z.string().min(1) });
export type LocateInput = z.input<typeof locateInput>;
export type ToolName =
  | 'get_project_info'
  | 'list_routes'
  | 'get_dev_errors'
  | 'inspect_page'
  | 'locate_element';
