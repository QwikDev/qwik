use crate::collector::{new_ident_from_id, GlobalCollect, Id, ImportKind};
use crate::parse::{emit_source_code, HookAnalysis, PathData, TransformModule, TransformOutput};
use crate::transform::{add_handle_watch, create_internal_call, create_synthetic_wildcard_import};
use crate::words::*;

use std::collections::BTreeMap;
use std::path::Path;

use anyhow::{format_err, Context, Error};
use path_slash::PathExt;
use swc_atoms::JsWord;
use swc_common::comments::{SingleThreadedComments, SingleThreadedCommentsMap};
use swc_common::{sync::Lrc, SourceMap, DUMMY_SP};
use swc_ecmascript::ast;

pub struct NewModuleCtx<'a> {
    pub expr: Box<ast::Expr>,
    pub path: &'a PathData,
    pub name: &'a str,
    pub origin: &'a str,
    pub local_idents: &'a [Id],
    pub scoped_idents: &'a [Id],
    pub global: &'a GlobalCollect,
    pub qwik_ident: &'a Id,
    pub is_entry: bool,
    pub leading_comments: SingleThreadedCommentsMap,
    pub trailing_comments: SingleThreadedCommentsMap,
}

pub fn new_module(ctx: NewModuleCtx) -> Result<(ast::Module, SingleThreadedComments), Error> {
    let comments = SingleThreadedComments::from_leading_and_trailing(
        ctx.leading_comments,
        ctx.trailing_comments,
    );
    let max_cap = ctx.global.imports.len() + ctx.global.exports.len();
    let mut module = ast::Module {
        span: DUMMY_SP,
        body: Vec::with_capacity(max_cap),
        shebang: None,
    };

    // Inject qwik internal import
    module.body.push(create_synthetic_wildcard_import(
        ctx.qwik_ident,
        &BUILDER_IO_QWIK,
    ));

    for id in ctx.local_idents {
        if let Some(import) = ctx.global.imports.get(id) {
            let specifier = match import.kind {
                ImportKind::Named => ast::ImportSpecifier::Named(ast::ImportNamedSpecifier {
                    is_type_only: false,
                    span: DUMMY_SP,
                    imported: if import.specifier == id.0 {
                        None
                    } else {
                        Some(ast::ModuleExportName::Ident(ast::Ident::new(
                            import.specifier.clone(),
                            DUMMY_SP,
                        )))
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
                            value: fix_path(ctx.origin, "a", import.source.as_ref())?,
                            raw: None,
                        },
                        specifiers: vec![specifier],
                    },
                )));
        } else if let Some(export) = ctx.global.exports.get(id) {
            let imported = export
                .as_ref()
                .map(|e| ast::ModuleExportName::Ident(ast::Ident::new(e.clone(), DUMMY_SP)));
            module
                .body
                .push(ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(
                    ast::ImportDecl {
                        span: DUMMY_SP,
                        type_only: false,
                        asserts: None,
                        src: ast::Str {
                            span: DUMMY_SP,
                            value: fix_path(ctx.origin, "a", &format!("./{}", ctx.path.file_stem))?,
                            raw: None,
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

    let expr = if !ctx.scoped_idents.is_empty() {
        Box::new(transform_function_expr(
            *ctx.expr,
            ctx.qwik_ident,
            ctx.scoped_idents,
        ))
    } else {
        ctx.expr
    };

    module.body.push(create_named_export(expr, ctx.name));
    if ctx.is_entry {
        // Inject qwik internal import
        add_handle_watch(&mut module.body, true);
    }
    Ok((module, comments))
}

pub fn fix_path<S: AsRef<Path>, D: AsRef<Path>>(
    src: S,
    dest: D,
    ident: &str,
) -> Result<JsWord, Error> {
    let src = src.as_ref();
    let dest = dest.as_ref();
    let src_str = src.to_slash_lossy();
    let dest_str = dest.to_slash_lossy();

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
            let normalize = diff.to_slash_lossy();
            let relative = relative_path::RelativePath::new(&normalize);
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

fn create_named_export(expr: Box<ast::Expr>, name: &str) -> ast::ModuleItem {
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
                init: Some(expr),
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
    explicity_extensions: bool,
) -> Result<TransformOutput, anyhow::Error> {
    let source_map = Lrc::new(SourceMap::default());
    let mut entries_map: BTreeMap<&str, Vec<&HookAnalysis>> = BTreeMap::new();
    let mut new_modules = Vec::with_capacity(output.modules.len());
    {
        let hooks: Vec<&HookAnalysis> = output.modules.iter().flat_map(|m| &m.hook).collect();
        for hook in hooks {
            if let Some(ref e) = hook.entry {
                entries_map
                    .entry(e.as_ref())
                    .or_insert_with(Vec::new)
                    .push(hook);
            }
        }

        for (entry, hooks) in &entries_map {
            let module = new_entry_module(hooks, explicity_extensions);
            let (code, map) = emit_source_code(Lrc::clone(&source_map), None, &module, false)
                .context("Emitting source code")?;
            new_modules.push(TransformModule {
                path: [entry, ".js"].concat(),
                code,
                map,
                is_entry: true,
                hook: None,
                order: 0,
            });
        }
    }
    output.modules.append(&mut new_modules);

    Ok(output)
}

fn new_entry_module(hooks: &[&HookAnalysis], explicity_extensions: bool) -> ast::Module {
    let mut module = ast::Module {
        span: DUMMY_SP,
        body: Vec::with_capacity(hooks.len()),
        shebang: None,
    };
    for hook in hooks {
        let mut src = ["./", &hook.canonical_filename].concat();
        if explicity_extensions {
            src = src + "." + hook.extension.as_ref();
        }
        module
            .body
            .push(ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportNamed(
                ast::NamedExport {
                    span: DUMMY_SP,
                    type_only: false,
                    asserts: None,
                    src: Some(ast::Str {
                        span: DUMMY_SP,
                        value: JsWord::from(src),
                        raw: None,
                    }),
                    specifiers: vec![ast::ExportSpecifier::Named(ast::ExportNamedSpecifier {
                        is_type_only: false,
                        span: DUMMY_SP,
                        orig: ast::ModuleExportName::Ident(ast::Ident::new(
                            hook.name.clone(),
                            DUMMY_SP,
                        )),
                        exported: None,
                    })],
                },
            )));
    }

    add_handle_watch(&mut module.body, false);
    module
}

pub fn transform_function_expr(
    expr: ast::Expr,
    qwik_ident: &Id,
    scoped_idents: &[Id],
) -> ast::Expr {
    match expr {
        ast::Expr::Arrow(node) => {
            ast::Expr::Arrow(transform_arrow_fn(node, qwik_ident, scoped_idents))
        }
        ast::Expr::Fn(node) => ast::Expr::Fn(transform_fn(node, qwik_ident, scoped_idents)),
        _ => expr,
    }
}

pub fn transform_arrow_fn(
    arrow: ast::ArrowExpr,
    qwik_ident: &Id,
    scoped_idents: &[Id],
) -> ast::ArrowExpr {
    match arrow.body {
        ast::BlockStmtOrExpr::BlockStmt(mut block) => {
            let mut stmts = Vec::with_capacity(1 + block.stmts.len());
            if !scoped_idents.is_empty() {
                stmts.push(create_use_lexical_scope(qwik_ident, scoped_idents));
            }
            stmts.append(&mut block.stmts);
            ast::ArrowExpr {
                body: ast::BlockStmtOrExpr::BlockStmt(ast::BlockStmt {
                    span: DUMMY_SP,
                    stmts,
                }),
                ..arrow
            }
        }
        ast::BlockStmtOrExpr::Expr(expr) => {
            let mut stmts = Vec::with_capacity(2);
            if !scoped_idents.is_empty() {
                stmts.push(create_use_lexical_scope(qwik_ident, scoped_idents));
            }
            stmts.push(create_return_stmt(expr));
            ast::ArrowExpr {
                body: ast::BlockStmtOrExpr::BlockStmt(ast::BlockStmt {
                    span: DUMMY_SP,
                    stmts,
                }),
                ..arrow
            }
        }
    }
}

pub fn transform_fn(node: ast::FnExpr, qwik_ident: &Id, scoped_idents: &[Id]) -> ast::FnExpr {
    let mut stmts = Vec::with_capacity(
        1 + node
            .function
            .body
            .as_ref()
            .map_or(0, |body| body.stmts.len()),
    );
    if !scoped_idents.is_empty() {
        stmts.push(create_use_lexical_scope(qwik_ident, scoped_idents));
    }
    if let Some(mut body) = node.function.body {
        stmts.append(&mut body.stmts);
    }
    ast::FnExpr {
        function: ast::Function {
            body: Some(ast::BlockStmt {
                span: DUMMY_SP,
                stmts,
            }),
            ..node.function
        },
        ..node
    }
}

const fn create_return_stmt(expr: Box<ast::Expr>) -> ast::Stmt {
    ast::Stmt::Return(ast::ReturnStmt {
        arg: Some(expr),
        span: DUMMY_SP,
    })
}

fn create_use_lexical_scope(qwik_ident: &Id, scoped_idents: &[Id]) -> ast::Stmt {
    ast::Stmt::Decl(ast::Decl::Var(ast::VarDecl {
        span: DUMMY_SP,
        declare: false,
        kind: ast::VarDeclKind::Const,
        decls: vec![ast::VarDeclarator {
            definite: false,
            span: DUMMY_SP,
            init: Some(Box::new(ast::Expr::Call(create_internal_call(
                qwik_ident,
                &USE_LEXICAL_SCOPE,
                vec![],
                None,
            )))),
            name: ast::Pat::Array(ast::ArrayPat {
                span: DUMMY_SP,
                optional: false,
                type_ann: None,
                elems: scoped_idents
                    .iter()
                    .map(|id| {
                        Some(ast::Pat::Ident(ast::BindingIdent::from(new_ident_from_id(
                            id,
                        ))))
                    })
                    .collect(),
            }),
        }],
    }))
}
