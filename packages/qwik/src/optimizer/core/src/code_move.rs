use crate::collector::{new_ident_from_id, GlobalCollect, Id, ImportKind};
use crate::parse::PathData;
use crate::transform::create_synthetic_named_import;
use crate::words::*;

use anyhow::Error;
use std::collections::BTreeMap;
use swc_atoms::Atom;
use swc_common::comments::{SingleThreadedComments, SingleThreadedCommentsMap};
use swc_common::DUMMY_SP;
use swc_ecmascript::ast;
use swc_ecmascript::utils::private_ident;

macro_rules! id {
	($ident: expr) => {
		($ident.sym.clone(), $ident.ctxt)
	};
}

pub struct NewModuleCtx<'a> {
	pub expr: Box<ast::Expr>,
	pub path: &'a PathData,
	pub name: &'a str,
	pub local_idents: &'a [Id],
	pub scoped_idents: &'a [Id],
	pub global: &'a GlobalCollect,
	pub core_module: &'a Atom,
	pub need_transform: bool,
	pub explicit_extensions: bool,
	pub leading_comments: SingleThreadedCommentsMap,
	pub trailing_comments: SingleThreadedCommentsMap,
	pub extra_top_items: &'a BTreeMap<Id, ast::ModuleItem>,
}

pub fn new_module(ctx: NewModuleCtx) -> Result<(ast::Module, SingleThreadedComments), Error> {
	let comments = SingleThreadedComments::from_leading_and_trailing(
		ctx.leading_comments,
		ctx.trailing_comments,
	);
	let max_cap = ctx.global.imports.len() + ctx.global.exports.len() + ctx.extra_top_items.len();
	let mut module = ast::Module {
		span: DUMMY_SP,
		body: Vec::with_capacity(max_cap),
		shebang: None,
	};

	let has_scoped_idents = ctx.need_transform && !ctx.scoped_idents.is_empty();
	let use_lexical_scope = if has_scoped_idents {
		let new_local = id!(private_ident!(&*USE_LEXICAL_SCOPE.clone()));
		module
			.body
			.push(create_synthetic_named_import(&new_local, ctx.core_module));
		Some(new_local)
	} else {
		None
	};

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
							Default::default(),
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
						with: import.asserts.clone(),
						phase: Default::default(),
						src: Box::new(ast::Str {
							span: DUMMY_SP,
							value: import.source.clone(),
							raw: None,
						}),
						specifiers: vec![specifier],
					},
				)));
		} else if let Some(export) = ctx.global.exports.get(id) {
			let filename = if ctx.explicit_extensions {
				&ctx.path.file_name
			} else {
				&ctx.path.file_stem
			};
			let imported = export.as_ref().map(|e| {
				ast::ModuleExportName::Ident(ast::Ident::new(
					e.clone(),
					DUMMY_SP,
					Default::default(),
				))
			});
			module
				.body
				.push(ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(
					ast::ImportDecl {
						span: DUMMY_SP,
						type_only: false,
						with: None,
						phase: Default::default(),
						src: Box::new(ast::Str {
							span: DUMMY_SP,
							value: format!("./{}", filename).into(),
							raw: None,
						}),
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

	let expr = if let Some(use_lexical_scope) = use_lexical_scope {
		Box::new(transform_function_expr(
			*ctx.expr,
			&use_lexical_scope,
			ctx.scoped_idents,
		))
	} else {
		ctx.expr
	};

	module.body.extend(ctx.extra_top_items.values().cloned());

	module.body.push(create_named_export(expr, ctx.name));
	Ok((module, comments))
}

fn create_named_export(expr: Box<ast::Expr>, name: &str) -> ast::ModuleItem {
	ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(ast::ExportDecl {
		span: DUMMY_SP,
		decl: ast::Decl::Var(Box::new(ast::VarDecl {
			span: DUMMY_SP,
			ctxt: Default::default(),
			kind: ast::VarDeclKind::Const,
			declare: false,
			decls: vec![ast::VarDeclarator {
				span: DUMMY_SP,
				definite: false,
				name: ast::Pat::Ident(ast::BindingIdent::from(ast::Ident::new(
					Atom::from(name),
					DUMMY_SP,
					Default::default(),
				))),
				init: Some(expr),
			}],
		})),
	}))
}

pub fn transform_function_expr(
	expr: ast::Expr,
	use_lexical_scope: &Id,
	scoped_idents: &[Id],
) -> ast::Expr {
	match expr {
		ast::Expr::Arrow(node) => {
			ast::Expr::Arrow(transform_arrow_fn(node, use_lexical_scope, scoped_idents))
		}
		ast::Expr::Fn(node) => ast::Expr::Fn(transform_fn(node, use_lexical_scope, scoped_idents)),
		_ => expr,
	}
}

fn transform_arrow_fn(
	arrow: ast::ArrowExpr,
	use_lexical_scope: &Id,
	scoped_idents: &[Id],
) -> ast::ArrowExpr {
	match arrow.body {
		box ast::BlockStmtOrExpr::BlockStmt(mut block) => {
			let mut stmts = Vec::with_capacity(1 + block.stmts.len());
			stmts.push(create_use_lexical_scope(use_lexical_scope, scoped_idents));
			stmts.append(&mut block.stmts);
			ast::ArrowExpr {
				body: Box::new(ast::BlockStmtOrExpr::BlockStmt(ast::BlockStmt {
					span: DUMMY_SP,
					ctxt: Default::default(),
					stmts,
				})),
				..arrow
			}
		}
		box ast::BlockStmtOrExpr::Expr(expr) => {
			let mut stmts = Vec::with_capacity(2);
			if !scoped_idents.is_empty() {
				stmts.push(create_use_lexical_scope(use_lexical_scope, scoped_idents));
			}
			stmts.push(create_return_stmt(expr));
			ast::ArrowExpr {
				body: Box::new(ast::BlockStmtOrExpr::BlockStmt(ast::BlockStmt {
					span: DUMMY_SP,
					ctxt: Default::default(),
					stmts,
				})),
				..arrow
			}
		}
	}
}

fn transform_fn(node: ast::FnExpr, use_lexical_scope: &Id, scoped_idents: &[Id]) -> ast::FnExpr {
	let mut stmts = Vec::with_capacity(
		1 + node
			.function
			.body
			.as_ref()
			.map_or(0, |body| body.stmts.len()),
	);
	if !scoped_idents.is_empty() {
		stmts.push(create_use_lexical_scope(use_lexical_scope, scoped_idents));
	}
	if let Some(mut body) = node.function.body {
		stmts.append(&mut body.stmts);
	}
	ast::FnExpr {
		function: Box::new(ast::Function {
			body: Some(ast::BlockStmt {
				span: DUMMY_SP,
				ctxt: Default::default(),
				stmts,
			}),
			..*node.function
		}),
		..node
	}
}

pub const fn create_return_stmt(expr: Box<ast::Expr>) -> ast::Stmt {
	ast::Stmt::Return(ast::ReturnStmt {
		arg: Some(expr),
		span: DUMMY_SP,
	})
}

fn create_use_lexical_scope(use_lexical_scope: &Id, scoped_idents: &[Id]) -> ast::Stmt {
	ast::Stmt::Decl(ast::Decl::Var(Box::new(ast::VarDecl {
		span: DUMMY_SP,
		ctxt: Default::default(),
		declare: false,
		kind: ast::VarDeclKind::Const,
		decls: vec![ast::VarDeclarator {
			definite: false,
			span: DUMMY_SP,
			init: Some(Box::new(ast::Expr::Call(ast::CallExpr {
				callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(
					use_lexical_scope,
				)))),
				..Default::default()
			}))),
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
	})))
}
