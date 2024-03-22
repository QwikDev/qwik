use swc_common::{Mark, Spanned};
use swc_ecmascript::ast;
use swc_ecmascript::visit::VisitMut;
pub struct Treeshaker {
	pub marker: CleanMarker,
	pub cleaner: CleanSideEffects,
}

pub struct CleanSideEffects {
	pub did_drop: bool,
	pub mark: Mark,
}

pub struct CleanMarker {
	pub mark: Mark,
}

impl Treeshaker {
	pub fn new() -> Self {
		let mark = Mark::new();
		Self {
			marker: CleanMarker { mark },
			cleaner: CleanSideEffects {
				did_drop: false,
				mark,
			},
		}
	}
}

impl VisitMut for CleanMarker {
	fn visit_mut_module_item(&mut self, node: &mut ast::ModuleItem) {
		if let ast::ModuleItem::Stmt(ast::Stmt::Expr(expr)) = node {
			expr.span = expr.span.apply_mark(self.mark);
		}
	}
}

impl VisitMut for CleanSideEffects {
	fn visit_mut_module(&mut self, node: &mut ast::Module) {
		let it = node.body.extract_if(|item| {
			if item.span().has_mark(self.mark) {
				return false;
			}
			match item {
				ast::ModuleItem::Stmt(ast::Stmt::Expr(expr)) => match *expr.expr {
					ast::Expr::New(_) | ast::Expr::Call(_) => {
						self.did_drop = true;
						true
					}
					_ => false,
				},
				_ => false,
			}
		});
		// Consume the iterator to force the extraction.
		for _ in it {}
	}
}
