//! Layer-A byte conformance: generated Rust renderers vs the JS engine's shell goldens.

use std::path::PathBuf;

#[test]
fn layer_a_shells_match_goldens() {
	assert!(!qwik_ssr_fixtures::FIXTURES.is_empty());
	for (name, render_page) in qwik_ssr_fixtures::FIXTURES {
		let golden = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
			.join("../../../../../../packages/compiler/conformance/layerA/fixtures")
			.join(name)
			.join("expected/shell.html");
		let expected = std::fs::read_to_string(&golden)
			.unwrap_or_else(|error| panic!("fixture {name}: cannot read golden: {error}"));
		assert_eq!(
			render_page(),
			expected.trim_end_matches('\n'),
			"fixture {name:?} diverges from the JS engine"
		);
	}
}
