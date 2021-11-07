use crate::collector::{GlobalCollect, ImportKind};
use crate::parse::{emit_source_code, HookAnalysis, PathData, TransformModule, TransformResult};
use crate::transform::Hook;
use crate::utils::MapVec;

use std::collections::HashSet;
use std::path::Path;
use swc_atoms::JsWord;
use swc_common::comments::{Comments, SingleThreadedComments};
use swc_common::{sync::Lrc, SourceMap, DUMMY_SP};
use swc_ecmascript::ast::*;

pub fn new_module(
    path: &PathData,
    hook: &Hook,
    global: &GlobalCollect,
) -> (Module, SingleThreadedComments) {
    let comments = SingleThreadedComments::default();
    let mut module = Module {
        span: DUMMY_SP,
        body: vec![],
        shebang: None,
    };
    for ident in &hook.local_idents {
        if let Some(import) = global.imports.get(ident) {
            let specifier = match import.kind {
                ImportKind::Named => ImportSpecifier::Named(ImportNamedSpecifier {
                    is_type_only: false,
                    span: DUMMY_SP,
                    imported: if &import.specifier == ident {
                        None
                    } else {
                        Some(Ident::new(import.specifier.clone(), DUMMY_SP))
                    },
                    local: Ident::new(ident.clone(), DUMMY_SP),
                }),
                ImportKind::Default => ImportSpecifier::Default(ImportDefaultSpecifier {
                    span: DUMMY_SP,
                    local: Ident::new(ident.clone(), DUMMY_SP),
                }),
                ImportKind::All => ImportSpecifier::Namespace(ImportStarAsSpecifier {
                    span: DUMMY_SP,
                    local: Ident::new(ident.clone(), DUMMY_SP),
                }),
            };
            module
                .body
                .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                    span: DUMMY_SP,
                    type_only: false,
                    asserts: None,
                    src: Str {
                        span: DUMMY_SP,
                        value: fix_path(&hook.origin, "a", import.source.as_ref()),
                        kind: StrKind::Synthesized,
                        has_escape: false,
                    },
                    specifiers: vec![specifier],
                })));
        } else if let Some(export) = global.exports.get(ident) {
            module
                .body
                .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                    span: DUMMY_SP,
                    type_only: false,
                    asserts: None,
                    src: Str {
                        span: DUMMY_SP,
                        value: fix_path(&hook.origin, "a", &["./", &path.file_stem].concat()),
                        kind: StrKind::Synthesized,
                        has_escape: false,
                    },
                    specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                        is_type_only: false,
                        span: DUMMY_SP,
                        imported: None,
                        local: Ident::new(export.clone(), DUMMY_SP),
                    })],
                })));
        }
    }
    module.body.push(create_named_export(hook, &comments));

    (module, comments)
}

pub fn fix_path(src: &str, dest: &str, ident: &str) -> JsWord {
    if src.starts_with('/') {
        panic!("hola");
    }
    if ident.starts_with('.') {
        let diff = pathdiff::diff_paths(
            Path::new(src).parent().unwrap(),
            Path::new(dest).parent().unwrap(),
        );
        if let Some(diff) = diff {
            let relative = relative_path::RelativePath::from_path(&diff).unwrap();
            let final_path = relative.join(ident).normalize();
            let final_str = final_path.as_str();
            if final_str.starts_with('.') {
                return JsWord::from(final_str);
            } else {
                return JsWord::from(["./", final_str].concat());
            }
        }
    }
    JsWord::from(ident)
}

fn create_named_export(hook: &Hook, comments: &SingleThreadedComments) -> ModuleItem {
    let expr = hook.expr.clone();
    comments.add_pure_comment(expr.span.lo);

    let module_item = ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
        span: DUMMY_SP,
        decl: Decl::Var(VarDecl {
            span: DUMMY_SP,
            kind: VarDeclKind::Const,
            declare: false,
            decls: vec![VarDeclarator {
                span: DUMMY_SP,
                definite: false,
                name: Pat::Ident(BindingIdent::from(Ident::new(
                    JsWord::from(hook.name.as_str()),
                    DUMMY_SP,
                ))),
                init: Some(Box::new(Expr::Call(expr))),
            }],
        }),
    }));

    module_item
}

#[test]
fn test_fix_path() {
    assert_eq!(
        fix_path("src/components.tsx", "a", "./state"),
        JsWord::from("./src/state")
    );

    assert_eq!(
        fix_path("src/path/components.tsx", "a", "./state"),
        JsWord::from("./src/path/state")
    );

    assert_eq!(
        fix_path("src/components.tsx", "a", "../state"),
        JsWord::from("./state")
    );
    assert_eq!(
        fix_path("components.tsx", "a", "./state"),
        JsWord::from("./state")
    );
}

pub fn generate_entries(
    result: TransformResult,
    default_ext: &str,
    source_map: Lrc<SourceMap>,
) -> TransformResult {
    let mut result = result;
    let mut entries_set = HashSet::new();
    let mut entries_map = MapVec::new();
    for hook in &result.hooks {
        let entry = if let Some(ref e) = hook.entry {
            e.clone()
        } else {
            hook.canonical_filename.clone()
        };
        if hook.entry != None {
            entries_map.push(entry.clone(), hook);
        }
        entries_set.insert(entry);
    }

    for (entry, hooks) in entries_map.as_ref().iter() {
        let module = new_entry_module(hooks);
        let (code, map) =
            emit_source_code(source_map.clone(), None, &module, false, false).unwrap();
        result.modules.push(TransformModule {
            path: [entry, ".", default_ext].concat(),
            code,
            map,
            is_entry: true,
        });
    }
    result
}

fn new_entry_module(hooks: &[&HookAnalysis]) -> Module {
    let mut module = Module {
        span: DUMMY_SP,
        body: vec![],
        shebang: None,
    };
    for hook in hooks {
        module
            .body
            .push(ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(
                NamedExport {
                    span: DUMMY_SP,
                    type_only: false,
                    asserts: None,
                    src: Some(Str {
                        span: DUMMY_SP,
                        value: JsWord::from(["./", &hook.canonical_filename].concat()),
                        kind: StrKind::Synthesized,
                        has_escape: false,
                    }),
                    specifiers: vec![ExportSpecifier::Named(ExportNamedSpecifier {
                        is_type_only: false,
                        span: DUMMY_SP,
                        orig: Ident::new(JsWord::from(hook.name.clone()), DUMMY_SP),
                        exported: None,
                    })],
                },
            )));
    }

    module
}
