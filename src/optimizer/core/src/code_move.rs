use crate::collector::{GlobalCollect, ImportKind};
use crate::transform::{Hook};

use swc_common::{DUMMY_SP};
use swc_atoms::JsWord;
use swc_ecmascript::ast::*;

pub fn new_module(file_stem: &str, hook: &Hook, global: &GlobalCollect) -> Module {
  let mut module = Module {
      span: DUMMY_SP,
      body: vec![],
      shebang: None,
  };
  for ident in &hook.local_idents {
      if let Some(import) = global.imports.get(&ident) {
          let specifier =match import.kind {
              ImportKind::ImportNamed => {
                  ImportSpecifier::Named(ImportNamedSpecifier {
                      is_type_only: false,
                      span: DUMMY_SP,
                      imported: if &import.specifier != ident { Some(Ident::new(import.specifier.clone(), DUMMY_SP)) } else { None },
                      local: Ident::new(ident.clone(), DUMMY_SP),
                  })
              },
              ImportKind::ImportDefault => {
                  ImportSpecifier::Default(ImportDefaultSpecifier {
                      span: DUMMY_SP,
                      local: Ident::new(ident.clone(), DUMMY_SP),
                  })
              }
              ImportKind::ImportAll => {
                  ImportSpecifier::Namespace(ImportStarAsSpecifier {
                      span: DUMMY_SP,
                      local: Ident::new(ident.clone(), DUMMY_SP),
                  })
              }
          };
          module
              .body
              .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                  span: DUMMY_SP,
                  type_only: false,
                  asserts: None,
                  src: Str {
                      span: DUMMY_SP,
                      value: import.source.clone(),
                      kind: StrKind::Synthesized,
                      has_escape: false,
                  },
                  specifiers: vec![specifier],
              })))
      } else if let Some(export) = global.exports.get(&ident) {
          module
              .body
              .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                  span: DUMMY_SP,
                  type_only: false,
                  asserts: None,
                  src: Str {
                      span: DUMMY_SP,
                      value: JsWord::from(format!("./{}", file_stem)),
                      kind: StrKind::Synthesized,
                      has_escape: false,
                  },
                  specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                      is_type_only: false,
                      span: DUMMY_SP,
                      imported: None,
                      local: Ident::new(export.clone(), DUMMY_SP),
                  })],
              })))
      }
  }
  module.body.push(create_named_export(hook));

  return module;
}


fn create_named_export(hook: &Hook) -> ModuleItem {
    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
        span: DUMMY_SP,
        decl: Decl::Var(VarDecl {
            span: DUMMY_SP,
            kind: VarDeclKind::Const,
            declare: false,
            decls: vec![VarDeclarator {
                span: DUMMY_SP,
                definite: false,
                name: Pat::Ident(BindingIdent::from(Ident::new(
                    hook.name.clone().into(),
                    DUMMY_SP,
                ))),
                init: Some(hook.expr.clone()),
            }],
        }),
    }))
}
