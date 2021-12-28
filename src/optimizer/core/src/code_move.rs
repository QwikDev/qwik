use crate::collector::{new_ident_from_id, GlobalCollect, Id, ImportKind};
use crate::parse::{emit_source_code, HookAnalysis, PathData, TransformModule, TransformOutput};

use std::collections::HashMap;
use std::path::Path;

use anyhow::{format_err, Context, Error};
use swc_atoms::JsWord;
use swc_common::comments::{Comments, SingleThreadedComments};
use swc_common::{sync::Lrc, SourceMap, DUMMY_SP};
use swc_ecmascript::ast;

pub fn new_module(
    expr: ast::CallExpr,
    path: &PathData,
    name: &str,
    origin: &str,
    local_idents: &[Id],
    global: &GlobalCollect,
) -> Result<(ast::Module, SingleThreadedComments), Error> {
    let comments = SingleThreadedComments::default();
    let max_cap = global.imports.len() + global.exports.len();
    let mut module = ast::Module {
        span: DUMMY_SP,
        body: Vec::with_capacity(max_cap),
        shebang: None,
    };

    for id in local_idents {
        if let Some(import) = global.imports.get(id) {
            let specifier = match import.kind {
                ImportKind::Named => ast::ImportSpecifier::Named(ast::ImportNamedSpecifier {
                    is_type_only: false,
                    span: DUMMY_SP,
                    imported: if import.specifier == id.0 {
                        None
                    } else {
                        Some(ast::Ident::new(import.specifier.clone(), DUMMY_SP))
                    },
                    local: new_ident_from_id(id),
                }),
                ImportKind::Default => ast::ImportSpecifier::Default(ast::ImportDefaultSpecifier {
                    span: DUMMY_SP,
                    local: new_ident_from_id(id),
                }),
                ImportKind::All => ast::ImportSpecifier::Namespace(ast::ImportStarAsSpecifier {
                    span: DUMMY_SP,
                    local: new_ident_from_id(id),
                }),
            };
            module
                .body
                .push(ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(
                    ast::ImportDecl {
                        span: DUMMY_SP,
                        type_only: false,
                        asserts: None,
                        src: ast::Str {
                            span: DUMMY_SP,
                            value: fix_path(origin, "a", import.source.as_ref())?,
                            kind: ast::StrKind::Synthesized,
                            has_escape: false,
                        },
                        specifiers: vec![specifier],
                    },
                )));
        } else if let Some(export) = global.exports.get(id) {
            let imported = if export == &id.0 {
                None
            } else {
                Some(ast::Ident::new(export.clone(), DUMMY_SP))
            };
            module
                .body
                .push(ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(
                    ast::ImportDecl {
                        span: DUMMY_SP,
                        type_only: false,
                        asserts: None,
                        src: ast::Str {
                            span: DUMMY_SP,
                            value: fix_path(origin, "a", &format!("./{}", path.file_stem))?,
                            kind: ast::StrKind::Synthesized,
                            has_escape: false,
                        },
                        specifiers: vec![ast::ImportSpecifier::Named(ast::ImportNamedSpecifier {
                            is_type_only: false,
                            span: DUMMY_SP,
                            imported,
                            local: new_ident_from_id(id),
                        })],
                    },
                )));
        }
    }
    module.body.push(create_named_export(expr, name, &comments));

    Ok((module, comments))
}

pub fn fix_path<S: AsRef<Path>, D: AsRef<Path>>(
    src: S,
    dest: D,
    ident: &str,
) -> Result<JsWord, Error> {
    let src = src.as_ref();
    let dest = dest.as_ref();
    let src_str = src.to_string_lossy();
    let dest_str = dest.to_string_lossy();

    if src_str.starts_with('/') {
        return Err(format_err!(
            "`fix_path`: `src` doesn't start with a slash: {}",
            src_str
        ));
    }

    if ident.starts_with('.') {
        let diff = pathdiff::diff_paths(
            src.parent()
                .with_context(|| format!("`fix_path`: `src` doesn't have a parent: {}", src_str))?,
            dest.parent().with_context(|| {
                format!("`fix_path`: `dest` doesn't have a parent: {}", dest_str)
            })?,
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

fn create_named_export(
    expr: ast::CallExpr,
    name: &str,
    comments: &SingleThreadedComments,
) -> ast::ModuleItem {
    comments.add_pure_comment(expr.span.lo);

    ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(ast::ExportDecl {
        span: DUMMY_SP,
        decl: ast::Decl::Var(ast::VarDecl {
            span: DUMMY_SP,
            kind: ast::VarDeclKind::Const,
            declare: false,
            decls: vec![ast::VarDeclarator {
                span: DUMMY_SP,
                definite: false,
                name: ast::Pat::Ident(ast::BindingIdent::from(ast::Ident::new(
                    JsWord::from(name),
                    DUMMY_SP,
                ))),
                init: Some(Box::new(ast::Expr::Call(expr))),
            }],
        }),
    }))
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
    mut output: TransformOutput,
    transpile: bool,
) -> Result<TransformOutput, anyhow::Error> {
    let source_map = Lrc::new(SourceMap::default());
    let mut entries_map = HashMap::new();
    let default_ext = if !transpile && output.is_type_script {
        "ts"
    } else {
        "js"
    };
    for hook in &output.hooks {
        if let Some(ref e) = hook.entry {
            entries_map
                .entry(e.as_ref())
                .or_insert_with(Vec::new)
                .push(hook);
        }
    }

    for (entry, hooks) in &entries_map {
        let module = new_entry_module(hooks);
        let (code, map) = emit_source_code(Lrc::clone(&source_map), None, &module, false, false)
            .context("Emitting source code")?;
        output.modules.push(TransformModule {
            path: [entry, ".", default_ext].concat(),
            code,
            map,
            is_entry: true,
        });
    }

    Ok(output)
}

fn new_entry_module(hooks: &[&HookAnalysis]) -> ast::Module {
    let mut module = ast::Module {
        span: DUMMY_SP,
        body: Vec::with_capacity(hooks.len()),
        shebang: None,
    };
    for hook in hooks {
        module
            .body
            .push(ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportNamed(
                ast::NamedExport {
                    span: DUMMY_SP,
                    type_only: false,
                    asserts: None,
                    src: Some(ast::Str {
                        span: DUMMY_SP,
                        value: JsWord::from(["./", &hook.canonical_filename].concat()),
                        kind: ast::StrKind::Synthesized,
                        has_escape: false,
                    }),
                    specifiers: vec![ast::ExportSpecifier::Named(ast::ExportNamedSpecifier {
                        is_type_only: false,
                        span: DUMMY_SP,
                        orig: ast::Ident::new(JsWord::from(hook.name.clone()), DUMMY_SP),
                        exported: None,
                    })],
                },
            )));
    }

    module
}
