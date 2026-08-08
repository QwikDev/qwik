//! `qwik-native-project <apps-dir> <out-dir>` — writes the generated Cargo project for every
//! built app. Run before cargo builds it, since manifests must exist at resolution time.

use std::path::PathBuf;

fn main() {
	let mut args = std::env::args().skip(1);
	let (Some(apps_dir), Some(out_dir)) = (args.next(), args.next()) else {
		eprintln!("usage: qwik-native-project <apps-dir> <out-dir>");
		std::process::exit(2);
	};
	let runtime_crates = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
		.parent()
		.expect("crates dir")
		.to_path_buf();

	let apps_dir = PathBuf::from(apps_dir);
	let out_dir = PathBuf::from(out_dir);
	let apps = qwik_ssr_gen::project::read_apps(&apps_dir).unwrap_or_else(|reason| {
		eprintln!("cannot read apps: {reason}");
		std::process::exit(1);
	});
	let failed = qwik_ssr_gen::project::generate_project(&apps, &out_dir, &runtime_crates)
		.unwrap_or_else(|reason| {
			eprintln!("cannot write project: {reason}");
			std::process::exit(1);
		});

	println!(
		"generated {} app crate(s) in {}",
		apps.len() - failed.len(),
		out_dir.display()
	);
	for (name, reason) in &failed {
		println!("  ❌ {name}: {reason}");
	}
}
