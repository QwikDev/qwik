//! Embed the qwikloader. App render code is not generated here: it lives in the generated
//! project (one crate per app), so that each app can carry its own dependencies.

use std::path::PathBuf;

fn main() {
	let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../../../..");
	let loader_path = repo_root.join("packages/qwik/dist/qwikloader.js");
	println!("cargo:rerun-if-changed={}", loader_path.display());
	let loader_raw = std::fs::read_to_string(&loader_path).unwrap_or_else(|error| {
		panic!("cannot read {loader_path:?}: {error} — run pnpm build.core.dev")
	});
	let loader = loader_raw.trim();
	let loader = loader.strip_suffix(';').unwrap_or(loader);

	let out_file = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("loader.rs");
	std::fs::write(
		out_file,
		format!("pub const QWIK_LOADER: &str = {loader:?};\n"),
	)
	.expect("write loader.rs");
}
