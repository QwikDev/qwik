/// Rename imports from @builder.io to @qwik.dev
use swc_ecmascript::ast;
use swc_ecmascript::visit::VisitMut;

pub struct RenameTransform;

impl VisitMut for RenameTransform {
	fn visit_mut_import_decl(&mut self, node: &mut ast::ImportDecl) {
		if node.src.value.starts_with("@builder.io/qwik-city") {
			node.src.value = ("@qwik.dev/router".to_string() + &node.src.value[21..]).into();
		} else if node.src.value.starts_with("@builder.io/qwik-react") {
			node.src.value = ("@qwik.dev/react".to_string() + &node.src.value[22..]).into();
		} else if node.src.value.starts_with("@builder.io/qwik") {
			node.src.value = ("@qwik.dev/core".to_string() + &node.src.value[16..]).into();
		}
	}
}
