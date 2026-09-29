import { z } from 'zod';

export const pageInput = z.object({ url: z.string().url().optional() });
export const inspectInput = pageInput.extend({
  selector: z.string().min(1).optional(),
  includeHtml: z.boolean().default(false),
  includeSignalValues: z.boolean().default(false),
});
export type InspectInput = z.input<typeof inspectInput>;
export type ToolName = 'get_project_info' | 'list_routes' | 'get_dev_errors' | 'inspect_page';
