use indexmap::IndexMap;
use swc_atoms::Atom;
use swc_common::Span;
use swc_ecmascript::ast;
use swc_ecmascript::visit::{noop_visit_type, Visit, VisitWith};

use crate::collector::{Id, Import, ImportKind};
use crate::transform::QwikTransform;

const DIAGNOSTIC_CODE: &str = "experimental-flag";

/// Experimental components that throw when they are rendered without their feature flag.
const EXPERIMENTAL_PRIMITIVES: &[(&str, &str)] = &[
	("Catch", "catchBoundary"),
	("Each", "each"),
	("Pending", "pendingBoundary"),
	("Reveal", "pendingBoundary"),
	("Show", "show"),
];

struct MissingFlag {
	symbol: &'static str,
	feature: &'static str,
	span: Span,
}

/// Report the first experimental primitive rendered as JSX without its feature flag.
///
/// This runs on the resolved AST, so aliases and namespace imports are recognized while strings,
/// comments, and shadowed identifiers are ignored. Both raw JSX and the lowered `jsx(...)` calls
/// are handled so the check works before and after JSX lowering.
pub fn report_missing_experimental_flags(
	program: &ast::Program,
	transform: &QwikTransform<'_>,
	enabled: &[String],
) {
	let mut finder = MissingFlagFinder {
		imports: &transform.options.global_collect.imports,
		core_module: &transform.options.core_module,
		enabled,
		found: None,
	};
	program.visit_with(&mut finder);

	let Some(missing) = finder.found else {
		return;
	};

	let message = format!(
		"<{}> requires the `{}` experimental feature. Enable it in your Qwik Vite config: qwikVite({{ experimental: [\"{}\"] }}).",
		missing.symbol, missing.feature, missing.feature
	);
	transform.emit_span_error_with_code(missing.span, &message, DIAGNOSTIC_CODE);
}

fn is_jsx_function(import: &Import) -> bool {
	if import.kind != ImportKind::Named {
		return false;
	}
	match import.source.as_ref() {
		"@qwik.dev/core" => matches!(import.specifier.as_ref(), "jsx" | "jsxs" | "jsxDEV"),
		"@qwik.dev/core/jsx-runtime" | "@qwik.dev/core/jsx-dev-runtime" => true,
		_ => false,
	}
}

struct MissingFlagFinder<'a> {
	imports: &'a IndexMap<Id, Import>,
	core_module: &'a Atom,
	enabled: &'a [String],
	found: Option<MissingFlag>,
}

impl MissingFlagFinder<'_> {
	fn is_enabled(&self, feature: &str) -> bool {
		self.enabled.iter().any(|enabled| enabled == feature)
	}

	fn check_primitive(&mut self, imported: &str, span: Span) {
		let Some(&(symbol, feature)) = EXPERIMENTAL_PRIMITIVES
			.iter()
			.find(|(symbol, _)| *symbol == imported)
		else {
			return;
		};
		if !self.is_enabled(feature) {
			self.found = Some(MissingFlag {
				symbol,
				feature,
				span,
			});
		}
	}

	fn check_component_ident(&mut self, ident: &ast::Ident) {
		let Some(import) = self.imports.get(&(ident.sym.clone(), ident.ctxt)) else {
			return;
		};
		if import.kind != ImportKind::Named || import.source != *self.core_module {
			return;
		}
		let imported = import.specifier.clone();
		self.check_primitive(imported.as_ref(), ident.span);
	}

	fn check_namespace_member(&mut self, obj: &ast::Ident, property: &str, span: Span) {
		let Some(import) = self.imports.get(&(obj.sym.clone(), obj.ctxt)) else {
			return;
		};
		if import.kind != ImportKind::All || import.source != *self.core_module {
			return;
		}
		self.check_primitive(property, span);
	}

	fn check_callee(&mut self, callee: &ast::Expr, args: &[ast::ExprOrSpread]) {
		let ast::Expr::Ident(callee_ident) = callee else {
			return;
		};
		let Some(callee_import) = self
			.imports
			.get(&(callee_ident.sym.clone(), callee_ident.ctxt))
		else {
			return;
		};
		if !is_jsx_function(callee_import) {
			return;
		}
		let Some(arg) = args.first() else {
			return;
		};
		match &*arg.expr {
			ast::Expr::Ident(ident) => self.check_component_ident(ident),
			ast::Expr::Member(member) => {
				if let (ast::Expr::Ident(obj), ast::MemberProp::Ident(prop)) =
					(&*member.obj, &member.prop)
				{
					self.check_namespace_member(obj, prop.sym.as_ref(), member.span);
				}
			}
			_ => {}
		}
	}
}

impl Visit for MissingFlagFinder<'_> {
	noop_visit_type!();

	fn visit_call_expr(&mut self, node: &ast::CallExpr) {
		if self.found.is_some() {
			return;
		}
		if let ast::Callee::Expr(callee) = &node.callee {
			self.check_callee(callee, &node.args);
		}
		node.visit_children_with(self);
	}

	fn visit_jsx_element_name(&mut self, node: &ast::JSXElementName) {
		if self.found.is_some() {
			return;
		}
		match node {
			ast::JSXElementName::Ident(ident) => self.check_component_ident(ident),
			ast::JSXElementName::JSXMemberExpr(member) => {
				if let ast::JSXObject::Ident(obj) = &member.obj {
					self.check_namespace_member(obj, member.prop.sym.as_ref(), member.span);
				}
			}
			ast::JSXElementName::JSXNamespacedName(_) => {}
		}
	}
}
