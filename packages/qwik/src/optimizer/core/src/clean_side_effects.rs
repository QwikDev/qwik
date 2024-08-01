use swc_common::Mark;
use swc_ecmascript::ast;
use swc_ecmascript::visit::VisitMut;

/// This is a simple treeshaker that removes anything with side effects from the module.
/// These are:
/// - `new` expressions
/// - `call` expressions
///
/// but only when they are not assigned and used elsewhere.
///
/// - First it marks top-level expressions
/// - Then the code needs to be simplified by you
/// - Then it removes all top-level expressions that are not marked. Those will be expressions that were
///   assigned to unused variables etc.
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
			match &*expr.expr {
				ast::Expr::New(e) => {
					e.ctxt.apply_mark(self.mark);
				}
				ast::Expr::Call(e) => {
					e.ctxt.apply_mark(self.mark);
				}
				_ => {}
			}
		}
	}
}

impl VisitMut for CleanSideEffects {
	fn visit_mut_module(&mut self, node: &mut ast::Module) {
		node.body.retain(|item| match item {
			ast::ModuleItem::Stmt(ast::Stmt::Expr(expr)) => match &*expr.expr {
				ast::Expr::New(e) => {
					if e.ctxt.has_mark(self.mark) {
						return true;
					}
					self.did_drop = true;
					false
				}
				ast::Expr::Call(e) => {
					if e.ctxt.has_mark(self.mark) {
						return true;
					}
					self.did_drop = true;
					false
				}
				_ => true,
			},
			_ => true,
		});
	}
}
