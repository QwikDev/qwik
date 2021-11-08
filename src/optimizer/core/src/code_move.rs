use crate::collector::{GlobalCollect, ImportKind};
use crate::parse::{emit_source_code, HookAnalysis, PathData, TransformModule, TransformOuput};
use crate::transform::Hook;

use anyhow::{format_err, Context, Error};
use std::collections::HashMap;
use std::path::Path;
use swc_atoms::JsWord;
use swc_common::comments::{Comments, SingleThreadedComments};
use swc_common::{sync::Lrc, SourceMap, DUMMY_SP};
use swc_ecmascript::ast::*;

pub fn new_module(
    path: &PathData,
    hook: &Hook,
    global: &GlobalCollect,
) -> Result<(Module, SingleThreadedComments), Error> {
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
                        value: fix_path(&hook.origin, "a", import.source.as_ref())?,
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
                        value: fix_path(&hook.origin, "a", &format!("./{}", path.file_stem))?,
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

    Ok((module, comments))
}

pub fn fix_path(src: &str, dest: &str, ident: &str) -> Result<JsWord, Error> {
    if src.starts_with('/') {
        return Err(format_err!(
            "`fix_path`: `src` doesn't start with a slash: {}",
            src
        ));
    }

    if ident.starts_with('.') {
        let diff = pathdiff::diff_paths(
            Path::new(src)
                .parent()
                .with_context(|| format!("`fix_path`: `src` doesn't have a parent: {}", src))?,
            Path::new(dest)
                .parent()
                .with_context(|| format!("`fix_path`: `dest` doesn't have a parent: {}", dest))?,
        );

        if let Some(diff) = diff {
            let relative = relative_path::RelativePath::from_path(&diff).with_context(|| {
                format!("Computing relative path from {}", diff.to_string_lossy())
            })?;
            let final_path = relative.join(ident).normalize();
            let final_str = final_path.as_str();
            return Ok(if final_str.starts_with('.') {
                JsWord::from(final_str)
            } else {
                JsWord::from(format!("./{}", final_str))
            });
        }
    }

    Ok(JsWord::from(ident))
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
        fix_path("src/components.tsx", "a", "./state").unwrap(),
        JsWord::from("./src/state")
    );

    assert_eq!(
        fix_path("src/path/components.tsx", "a", "./state").unwrap(),
        JsWord::from("./src/path/state")
    );

    assert_eq!(
        fix_path("src/components.tsx", "a", "../state").unwrap(),
        JsWord::from("./state")
    );
    assert_eq!(
        fix_path("components.tsx", "a", "./state").unwrap(),
        JsWord::from("./state")
    );
    assert!(fix_path("/components", "a", "./state").is_err())
}

pub fn generate_entries(
    mut result: TransformOuput,
    default_ext: &str,
    source_map: &Lrc<SourceMap>,
) -> Result<TransformOuput, anyhow::Error> {
    let mut entries_map = HashMap::new();
    for hook in &result.hooks {
        if hook.entry != None {
            entries_map
                .entry(hook.entry.as_ref().unwrap_or(&hook.canonical_filename))
                .or_insert_with(Vec::new)
                .push(hook);
        }
    }

    for (entry, hooks) in entries_map.iter() {
        let module = new_entry_module(hooks);
        let (code, map) = emit_source_code(source_map, None, &module, false, false)
            .context("Emitting source code")?;
        result.modules.push(TransformModule {
            path: format!("{}.{}", entry, default_ext),
            code,
            map,
            is_entry: true,
        });
    }
    Ok(result)
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
