import {
  EachSourceKind,
  IndexMode,
  OpKind,
  ResumeKind,
  ValueKind,
  type LinkedModule,
  type LinkedOp,
  type QrlUse,
} from '../schema';
import { UnsupportedError } from '../errors';
import { QwikGenWord, QwikWord } from '../words';
import { inlineValueJs } from './emit-chunk';
import { signalReadName } from './emit-setup';

/** Materialize derived sources once, shared by rendering and SSR rooting. */
export function emitCollectionSource(
  module: LinkedModule,
  op: Extract<LinkedOp, { op: OpKind.Each }>,
  pass: { statements: string[]; next: (prefix: string) => string },
  imports: Set<string>,
  resolveQrl: (use: QrlUse) => string
): string {
  const { s, value } = op.source;
  switch (s) {
    case EachSourceKind.Array:
      return inlineValueJs(module, value);
    case EachSourceKind.Reactive:
      if (value.v !== ValueKind.Read) {
        throw new UnsupportedError('a non-signal collection source');
      }
      return signalReadName(module, value.expr);
    case EachSourceKind.Derived: {
      if (value.v !== ValueKind.Computed || value.resume.r !== ResumeKind.Qrl) {
        throw new UnsupportedError('a derived collection source without a QRL');
      }
      const reference = resolveQrl(value.resume.qrl);
      imports.add(QwikWord.WrapArray);
      const source = pass.next(QwikGenWord.CollectionSource);
      pass.statements.push(
        `const ${source} = ${QwikWord.WrapArray}(${reference}${op.index === IndexMode.None ? '' : ', true'});`
      );
      return source;
    }
  }
}
