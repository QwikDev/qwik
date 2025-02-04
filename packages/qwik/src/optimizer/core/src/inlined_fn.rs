use std::collections::HashMap;

use crate::collector::{new_ident_from_id, Id};
use std::str;
use swc_common::DUMMY_SP;
use swc_common::{sync::Lrc, SourceMap};
use swc_ecmascript::ast;
use swc_ecmascript::codegen::text_writer::JsWriter;
use swc_ecmascript::transforms::fixer;
use swc_ecmascript::transforms::hygiene::hygiene_with_config;
use swc_ecmascript::visit::{Visit, VisitWith};
use swc_ecmascript::{
	utils::private_ident,
	visit::{VisitMut, VisitMutWith},
};

macro_rules! id {
	($ident: expr) => {
		($ident.sym.clone(), $ident.ctxt)
	};
}

// This generates the `_fnSignal` function call in JSX
pub fn convert_inlined_fn(
	mut expr: ast::Expr,
	scoped_idents: Vec<Id>,
	qqsegment: &Id,
	accept_call_expr: bool,
	serialize_fn: bool,
	is_const: bool,
) -> (Option<ast::Expr>, bool) {
	let mut identifiers = HashMap::new();
	let params: Vec<ast::Pat> = scoped_idents
		.iter()
		.enumerate()
		.map(|(index, id)| {
			let new_ident = private_ident!(format!("p{}", index));
			identifiers.insert(id.clone(), ast::Expr::Ident(new_ident.clone()));
			ast::Pat::Ident(ast::BindingIdent {
				id: new_ident,
				type_ann: None,
			})
		})
		.collect();

	if matches!(expr, ast::Expr::Arrow(_)) {
		return (None, is_const);
	}

	if !is_used_as_object(&expr, &scoped_idents) {
		return (None, is_const);
	}

	// Replace identifier
	let mut replace_identifiers = ReplaceIdentifiers::new(identifiers, accept_call_expr);
	expr.visit_mut_with(&mut replace_identifiers);

	if replace_identifiers.abort {
		return (None, is_const);
	}

	let rendered_expr = render_expr(&expr);
	if rendered_expr.len() > 150 {
		return (None, is_const);
	}

	if scoped_idents.is_empty() {
		return (None, true);
	}

	// Generate stringified version
	let rendered_str =
		ast::ExprOrSpread::from(ast::Expr::Lit(ast::Lit::Str(ast::Str::from(rendered_expr))));

	// Wrap around arrow functions
	let expr = ast::Expr::Arrow(ast::ArrowExpr {
		body: Box::new(ast::BlockStmtOrExpr::Expr(Box::new(expr))),
		params,
		..Default::default()
	});

	let mut args = vec![
		ast::ExprOrSpread::from(expr),
		ast::ExprOrSpread::from(ast::Expr::Array(ast::ArrayLit {
			span: DUMMY_SP,
			elems: scoped_idents
				.iter()
				.map(|id| {
					Some(ast::ExprOrSpread::from(ast::Expr::Ident(
						new_ident_from_id(id),
					)))
				})
				.collect(),
		})),
	];

	if serialize_fn {
		args.push(rendered_str)
	}

	(
		Some(ast::Expr::Call(ast::CallExpr {
			callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(qqsegment)))),
			args,
			..Default::default()
		})),
		is_const,
	)
}

struct ReplaceIdentifiers {
	pub identifiers: HashMap<Id, ast::Expr>,
	pub accept_call_expr: bool,
	pub abort: bool,
}

impl ReplaceIdentifiers {
	const fn new(identifiers: HashMap<Id, ast::Expr>, accept_call_expr: bool) -> Self {
		Self {
			identifiers,
			accept_call_expr,
			abort: false,
		}
	}
}

impl VisitMut for ReplaceIdentifiers {
	fn visit_mut_expr(&mut self, node: &mut ast::Expr) {
		match node {
			ast::Expr::Ident(ident) => {
				if let Some(expr) = self.identifiers.get(&id!(ident)) {
					*node = expr.clone();
				}
			}
			_ => {
				node.visit_mut_children_with(self);
			}
		}
	}

	fn visit_mut_prop(&mut self, node: &mut ast::Prop) {
		if let ast::Prop::Shorthand(short) = node {
			if let Some(expr) = self.identifiers.get(&id!(short)) {
				*node = ast::Prop::KeyValue(ast::KeyValueProp {
					key: ast::PropName::Ident(short.clone().into()),
					value: Box::new(expr.clone()),
				});
			}
		}
		node.visit_mut_children_with(self);
	}

	fn visit_mut_callee(&mut self, node: &mut ast::Callee) {
		if !self.accept_call_expr || matches!(node, ast::Callee::Import(_)) {
			self.abort = true;
		} else {
			node.visit_mut_children_with(self);
		}
	}

	fn visit_mut_arrow_expr(&mut self, _: &mut ast::ArrowExpr) {
		self.abort = true;
	}

	fn visit_mut_function(&mut self, _: &mut ast::Function) {
		self.abort = true;
	}

	fn visit_mut_class_expr(&mut self, _: &mut ast::ClassExpr) {
		self.abort = true;
	}

	fn visit_mut_decorator(&mut self, _: &mut ast::Decorator) {
		self.abort = true;
	}

	fn visit_mut_stmt(&mut self, _: &mut ast::Stmt) {
		self.abort = true;
	}
}

pub fn render_expr(expr: &ast::Expr) -> String {
	let mut expr = expr.clone();
	let mut buf = Vec::new();
	let source_map = Lrc::new(SourceMap::default());
	let writer = Box::new(JsWriter::new(Lrc::clone(&source_map), "\n", &mut buf, None));
	let config = swc_ecmascript::codegen::Config::default().with_minify(true);
	let mut emitter = swc_ecmascript::codegen::Emitter {
		cfg: config,
		comments: None,
		cm: Lrc::clone(&source_map),
		wr: writer,
	};
	expr.visit_mut_with(&mut hygiene_with_config(Default::default()));
	expr.visit_mut_with(&mut fixer(None));
	emitter
		.emit_module_item(&ast::ModuleItem::Stmt(ast::Stmt::Expr(ast::ExprStmt {
			span: DUMMY_SP,
			expr: Box::new(expr),
		})))
		.expect("Should emit");

	str::from_utf8(&buf)
		.expect("should be utf8")
		.trim_end_matches(';')
		.to_string()
}

struct ObjectUsageChecker<'a> {
	identifiers: &'a Vec<Id>,
	used_as_object: bool,
}

impl<'a> Visit for ObjectUsageChecker<'a> {
	fn visit_member_expr(&mut self, node: &ast::MemberExpr) {
		if let ast::Expr::Ident(obj_ident) = &*node.obj {
			for id in self.identifiers {
				if obj_ident.sym == id.0 {
					self.used_as_object = true;
					return;
				}
			}
		}
		node.visit_children_with(self);
	}
}

fn is_used_as_object(expr: &ast::Expr, identifiers: &Vec<Id>) -> bool {
	let mut checker = ObjectUsageChecker {
		identifiers,
		used_as_object: false,
	};

	expr.visit_with(&mut checker);

	checker.used_as_object
}
