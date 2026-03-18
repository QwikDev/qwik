use crate::collector::GlobalCollect;
use crate::transform::{IdPlusType, IdentType};
use swc_ecmascript::ast;
use swc_ecmascript::visit::{noop_visit_type, Visit, VisitWith};

macro_rules! id {
	($ident: expr) => {
		($ident.sym.clone(), $ident.ctxt)
	};
}

pub fn is_const_expr(
	expr: &ast::Expr,
	global: &GlobalCollect,
	current_stack: Option<&Vec<IdPlusType>>,
) -> bool {
	let mut collector = ConstCollector::new(global, current_stack);
	collector.visit_expr(expr);
	collector.is_const
}

pub struct ConstCollector<'a> {
	global: &'a GlobalCollect,
	const_idents: Option<&'a Vec<IdPlusType>>,

	pub is_const: bool,
}

impl<'a> ConstCollector<'a> {
	const fn new(global: &'a GlobalCollect, const_idents: Option<&'a Vec<IdPlusType>>) -> Self {
		Self {
			global,
			is_const: true,
			const_idents,
		}
	}
}

// A prop is considered var if it:
// - calls a function
// - accesses a member
// - is a variable that is not an import, an export, or in the const stack
impl<'a> Visit for ConstCollector<'a> {
	noop_visit_type!();

	fn visit_call_expr(&mut self, node: &ast::CallExpr) {
		let scoped_idents = self
			.const_idents
			.map(|v| v.iter().map(|id| id.0.clone()).collect::<Vec<_>>());
		if crate::inlined_fn::is_safe_global_call(node, scoped_idents.as_ref(), Some(self.global)) {
			node.visit_children_with(self);
		} else {
			self.is_const = false;
		}
	}

	fn visit_member_expr(&mut self, _: &ast::MemberExpr) {
		self.is_const = false;
	}

	fn visit_arrow_expr(&mut self, _: &ast::ArrowExpr) {}

	fn visit_ident(&mut self, ident: &ast::Ident) {
		let id = id!(ident);
		if self.global.imports.contains_key(&id) {
			return;
		}
		if self.global.has_export_id(&id) {
			return;
		}
		if let Some(current_stack) = self.const_idents {
			if current_stack
				.iter()
				.any(|item| item.1 == IdentType::Var(true) && item.0 == id)
			{
				return;
			}
		}
		self.is_const = false;
	}
}
