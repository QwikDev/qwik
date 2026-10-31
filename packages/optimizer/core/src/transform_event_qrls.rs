use super::jsx_event_to_html_attribute;
use crate::collector::{GlobalCollect, Id};
use crate::words::{_JSX_SORTED, _JSX_SPLIT};
use std::collections::{HashMap, HashSet};
use swc_common::{BytePos, Spanned};
use swc_ecmascript::{
	ast,
	visit::{noop_visit_type, Visit, VisitWith},
};

#[derive(Default)]
struct Uses {
	event: bool,
	blocked: bool,
	sources: Vec<Id>,
}

struct EventQrls {
	producers: HashSet<Id>,
	jsx: HashSet<Id>,
	optimized_jsx: HashSet<Id>,
	candidates: HashMap<Id, BytePos>,
	uses: HashMap<Id, Uses>,
	deferred: bool,
	native: bool,
}

fn bound_value(expr: &ast::Expr) -> &ast::Expr {
	if let ast::Expr::Call(call) = expr {
		if let ast::Callee::Expr(callee) = &call.callee {
			if let ast::Expr::Member(member) = callee.as_ref() {
				if matches!(&member.prop, ast::MemberProp::Ident(name) if name.sym == *"w") {
					return &member.obj;
				}
			}
		}
	}
	expr
}

impl EventQrls {
	fn reference(&mut self, name: &ast::Ident, event: bool) {
		let usage = self.uses.entry(name.to_id()).or_default();
		usage.event |= event;
		usage.blocked |= !event;
	}

	fn event_value(&mut self, value: &ast::Expr) {
		match value {
			ast::Expr::Ident(ident) => self.reference(ident, true),
			ast::Expr::Arrow(_) | ast::Expr::Fn(_) => {
				let previous = self.deferred;
				self.deferred = true;
				value.visit_children_with(self);
				self.deferred = previous;
			}
			ast::Expr::Array(array) => {
				for element in array.elems.iter().flatten() {
					if element.spread.is_none() {
						self.event_value(&element.expr);
					} else {
						element.visit_with(self);
					}
				}
			}
			ast::Expr::Cond(cond) => {
				cond.test.visit_with(self);
				self.event_value(&cond.cons);
				self.event_value(&cond.alt);
			}
			ast::Expr::Paren(paren) => self.event_value(&paren.expr),
			_ => value.visit_with(self),
		}
	}

	fn event_props(&mut self, props: &ast::ObjectLit) {
		for prop in &props.props {
			if let ast::PropOrSpread::Prop(property) = prop {
				if let ast::Prop::KeyValue(property) = property.as_ref() {
					let name = match &property.key {
						ast::PropName::Ident(name) => Some(name.sym.as_ref()),
						ast::PropName::Str(name) => Some(name.value.as_ref()),
						_ => None,
					};
					if let Some(name) = name {
						let serialized = name
							.strip_prefix("q-")
							.and_then(|name| name.split_once(':'))
							.is_some_and(|(scope, _)| {
								matches!(scope.strip_suffix('p').unwrap_or(scope), "e" | "d" | "w")
							});
						if serialized || jsx_event_to_html_attribute(name, false).is_some() {
							self.event_value(&property.value);
							continue;
						}
					}
				}
			}
			prop.visit_with(self);
		}
	}
}

impl Visit for EventQrls {
	noop_visit_type!();

	fn visit_var_decl(&mut self, node: &ast::VarDecl) {
		for decl in &node.decls {
			if node.kind == ast::VarDeclKind::Const {
				if let (ast::Pat::Ident(name), Some(init)) = (&decl.name, &decl.init) {
					let id = name.id.to_id();
					match bound_value(init) {
						ast::Expr::Ident(source) => {
							self.uses
								.entry(id)
								.or_default()
								.sources
								.push(source.to_id());
							if let ast::Expr::Call(call) = init.as_ref() {
								call.args.visit_with(self);
							}
							continue;
						}
						ast::Expr::Call(call) => {
							if let ast::Callee::Expr(callee) = &call.callee {
								if matches!(callee.as_ref(), ast::Expr::Ident(name) if self.producers.contains(&name.to_id()))
								{
									if let Some(arg) = call.args.first() {
										self.candidates.insert(id, arg.expr.span().lo);
									}
								}
							}
						}
						_ => {}
					}
				}
			}
			decl.visit_children_with(self);
		}
	}

	fn visit_expr(&mut self, node: &ast::Expr) {
		if let ast::Expr::Ident(name) = node {
			self.reference(name, self.deferred);
		}
		node.visit_children_with(self);
	}

	fn visit_prop(&mut self, node: &ast::Prop) {
		if let ast::Prop::Shorthand(name) = node {
			self.reference(name, self.deferred);
		}
		node.visit_children_with(self);
	}

	fn visit_named_export(&mut self, node: &ast::NamedExport) {
		if node.src.is_none() {
			for specifier in &node.specifiers {
				if let ast::ExportSpecifier::Named(specifier) = specifier {
					if let ast::ModuleExportName::Ident(name) = &specifier.orig {
						self.reference(name, false);
					}
				}
			}
		}
		node.visit_children_with(self);
	}

	fn visit_jsx_element(&mut self, node: &ast::JSXElement) {
		let previous = self.native;
		self.native = matches!(&node.opening.name, ast::JSXElementName::Ident(name) if name.sym.chars().next().is_some_and(|c| c.is_ascii_lowercase()));
		node.opening.visit_with(self);
		self.native = previous;
		node.children.visit_with(self);
		node.closing.visit_with(self);
	}

	fn visit_jsx_attr(&mut self, node: &ast::JSXAttr) {
		let name = match &node.name {
			ast::JSXAttrName::Ident(name) => name.sym.to_string(),
			ast::JSXAttrName::JSXNamespacedName(name) => {
				format!("{}:{}", name.ns.sym, name.name.sym)
			}
		};
		if self.native && jsx_event_to_html_attribute(&name, false).is_some() {
			if let Some(ast::JSXAttrValue::JSXExprContainer(value)) = &node.value {
				if let ast::JSXExpr::Expr(value) = &value.expr {
					self.event_value(value);
					return;
				}
			}
		}
		node.visit_children_with(self);
	}

	fn visit_call_expr(&mut self, node: &ast::CallExpr) {
		let native = matches!(&node.callee, ast::Callee::Expr(callee) if matches!(callee.as_ref(), ast::Expr::Ident(name) if self.jsx.contains(&name.to_id())))
			&& matches!(
				node.args.first().map(|arg| arg.expr.as_ref()),
				Some(ast::Expr::Lit(ast::Lit::Str(_)))
			);
		if !native {
			node.visit_children_with(self);
			return;
		}
		let optimized = matches!(&node.callee, ast::Callee::Expr(callee) if matches!(callee.as_ref(), ast::Expr::Ident(name) if self.optimized_jsx.contains(&name.to_id())));
		node.callee.visit_with(self);
		for (index, arg) in node.args.iter().enumerate() {
			if index == 1 || (optimized && index == 2) {
				if let ast::Expr::Object(props) = arg.expr.as_ref() {
					self.event_props(props);
					continue;
				}
			}
			arg.visit_with(self);
		}
	}
}

/// Only proven event consumers may move a QRL outside rendering.
pub fn collect_event_only_qrls(
	module: &ast::Module,
	imports: &GlobalCollect,
	jsx: &HashSet<Id>,
	producers: impl Iterator<Item = Id>,
) -> HashSet<BytePos> {
	let mut visitor = EventQrls {
		producers: producers.collect(),
		jsx: jsx.clone(),
		optimized_jsx: HashSet::new(),
		candidates: HashMap::new(),
		uses: HashMap::new(),
		deferred: false,
		native: false,
	};
	for (id, import) in &imports.imports {
		if import.source == *"@qwik.dev/core"
			&& (import.specifier == *_JSX_SORTED || import.specifier == *_JSX_SPLIT)
		{
			visitor.jsx.insert(id.clone());
			visitor.optimized_jsx.insert(id.clone());
		}
	}
	module.visit_with(&mut visitor);
	let uses = &mut visitor.uses;
	for event_flag in [true, false] {
		let mut queue: Vec<_> = uses
			.iter()
			.filter(|(_, usage)| {
				if event_flag {
					usage.event
				} else {
					usage.blocked
				}
			})
			.map(|(id, _)| id.clone())
			.collect();
		let mut i = 0;
		while i < queue.len() {
			let sources = uses[&queue[i]].sources.clone();
			for source in sources {
				let usage = uses.entry(source.clone()).or_default();
				let flag = if event_flag {
					&mut usage.event
				} else {
					&mut usage.blocked
				};
				if !*flag {
					*flag = true;
					queue.push(source);
				}
			}
			i += 1;
		}
	}
	visitor
		.candidates
		.into_iter()
		.filter(|(id, _)| {
			uses.get(id)
				.is_some_and(|usage| usage.event && !usage.blocked)
		})
		.map(|(_, span)| span)
		.collect()
}
