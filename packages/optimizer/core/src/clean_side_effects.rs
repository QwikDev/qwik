use std::cell::RefCell;
use std::collections::HashSet;
use std::rc::Rc;

use swc_common::Span;
use swc_common::Spanned;
use swc_ecmascript::ast::Module;
use swc_ecmascript::ast::{Expr, ModuleItem, Stmt};
use swc_ecmascript::visit::VisitMut;

/// This is a simple treeshaker that removes anything with side effects from the module.
/// These are:
/// - `new` expressions
/// - `call` expressions
///
/// but only when they are not assigned and used elsewhere, or when they were already present before simplifying.
///
/// - First it marks top-level expressions
/// - Then the code needs to be simplified by you
/// - Then it removes all top-level expressions that are not marked. Those will be expressions that were
///   assigned to unused variables etc.
pub struct Treeshaker {
	pub marker: CleanMarker,
	pub cleaner: CleanSideEffects,
}

pub struct CleanMarker {
	set: Rc<RefCell<HashSet<Span>>>,
}

pub struct CleanSideEffects {
	pub did_drop: bool,
	set: Rc<RefCell<HashSet<Span>>>,
}

impl Treeshaker {
	pub fn new() -> Self {
		let set = Rc::new(RefCell::new(HashSet::new()));
		Self {
			marker: CleanMarker {
				set: Rc::clone(&set),
			},
			cleaner: CleanSideEffects {
				did_drop: false,
				set: Rc::clone(&set),
			},
		}
	}
}

impl VisitMut for CleanMarker {
	fn visit_mut_module_item(&mut self, node: &mut ModuleItem) {
		if let ModuleItem::Stmt(Stmt::Expr(expr)) = node {
			match &*expr.expr {
				Expr::New(e) => {
					self.set.borrow_mut().insert(e.span());
				}
				Expr::Call(e) => {
					self.set.borrow_mut().insert(e.span());
				}
				_ => {}
			}
		}
	}
}

impl VisitMut for CleanSideEffects {
	fn visit_mut_module(&mut self, node: &mut Module) {
		node.body.retain(|item| match item {
			ModuleItem::Stmt(Stmt::Expr(expr)) => match &*expr.expr {
				Expr::New(e) => {
					if self.set.borrow().contains(&e.span()) {
						return true;
					}
					self.did_drop = true;
					false
				}
				Expr::Call(e) => {
					if self.set.borrow().contains(&e.span()) {
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
