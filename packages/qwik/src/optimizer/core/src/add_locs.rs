use crate::words::_ADD_LOC;
use swc_atoms::JsWord;
use swc_common::{SourceMap, Spanned, SyntaxContext, DUMMY_SP};
use swc_ecmascript::{
	ast::{self},
	visit::{VisitMut, VisitMutWith},
};

pub struct AddLocs<'a> {
	pub source_map: &'a SourceMap,
	pub file_name: String,
	pub did_add_loc: bool,
}

impl<'a> AddLocs<'a> {
	pub const fn new(source_map: &'a SourceMap, file_name: String) -> Self {
		Self {
			source_map,
			file_name,
			did_add_loc: false,
		}
	}
}

impl<'a> VisitMut for AddLocs<'a> {
	fn visit_mut_var_declarator(&mut self, node: &mut ast::VarDeclarator) {
		node.visit_mut_children_with(self);

		if let (Some(init), ast::Pat::Ident(_)) = (&node.init, &node.name) {
			let loc = self.source_map.lookup_char_pos(init.span_lo());
			node.init = Some(Box::new(ast::Expr::Call(ast::CallExpr {
				span: init.span(),
				callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(ast::Ident {
					span: init.span(),
					sym: _ADD_LOC.clone(),
					optional: false,
					ctxt: SyntaxContext::default(),
				}))),
				args: vec![
					ast::ExprOrSpread {
						spread: None,
						expr: init.clone(),
					},
					ast::ExprOrSpread {
						spread: None,
						expr: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
							span: DUMMY_SP,
							value: JsWord::from(self.file_name.clone()),
							raw: None,
						}))),
					},
					ast::ExprOrSpread {
						spread: None,
						expr: Box::new(ast::Expr::Lit(ast::Lit::Num(ast::Number {
							span: DUMMY_SP,
							value: (loc.line + 1) as f64,
							raw: None,
						}))),
					},
					ast::ExprOrSpread {
						spread: None,
						expr: Box::new(ast::Expr::Lit(ast::Lit::Num(ast::Number {
							span: DUMMY_SP,
							value: (loc.col.0 + 1) as f64,
							raw: None,
						}))),
					},
				],
				type_args: None,
				ctxt: SyntaxContext::default(),
			})));
			self.did_add_loc = true;
		}
	}
}
