use swc_ecmascript::ast;
use swc_ecmascript::visit::{VisitMut, VisitMutWith};

pub struct KeyBeforeSpreadTransform;

impl VisitMut for KeyBeforeSpreadTransform {
	fn visit_mut_jsx_opening_element(&mut self, node: &mut ast::JSXOpeningElement) {
		node.visit_mut_children_with(self);
		let Some(first_spread) = node
			.attrs
			.iter()
			.position(|attr| matches!(attr, ast::JSXAttrOrSpread::SpreadElement(_)))
		else {
			return;
		};
		node.attrs[first_spread..].sort_by_key(|attr| !is_key_attr(attr));
	}
}

fn is_key_attr(attr: &ast::JSXAttrOrSpread) -> bool {
	matches!(
		attr,
		ast::JSXAttrOrSpread::JSXAttr(ast::JSXAttr {
			name: ast::JSXAttrName::Ident(name),
			..
		}) if &*name.sym == "key"
	)
}
