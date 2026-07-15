import type { BindingId } from './plan-types';
import type { SourceRange } from './types';

export interface EmittedComponentCode {
  readonly bindingId: BindingId;
  readonly moduleCode: string;
  readonly rangeCode: string;
}

export interface EmittedModule {
  readonly imports: string[];
  readonly localImports: string[];
  readonly hoists: string[];
  readonly components: EmittedComponentCode[];
  readonly replacements: readonly { range: SourceRange; value: string }[];
}
