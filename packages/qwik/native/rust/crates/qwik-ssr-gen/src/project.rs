//! Writes the generated Cargo project (specs/09): one crate per app, plus a root binary that
//! serves them. Manifests must exist before cargo resolves the graph, so this runs as a build
//! step — a `build.rs` cannot add dependencies to its own crate, which is why app render code
//! no longer compiles into the host.

use crate::{generate_component, generate_defs, generate_plugin_fns, render_function_name};
use serde_json::Value as Json;
use std::fmt::Write as _;
use std::path::{Path, PathBuf};

/// Attributes for generated code, which is machine-shaped rather than idiomatic.
const GENERATED_ALLOW: &str = "#![allow(\n\tnon_snake_case,\n\tunused_mut,\n\tunused_variables,\n\tclippy::type_complexity,\n\tclippy::comparison_to_empty,\n\tclippy::needless_borrow,\n\tclippy::needless_else,\n\tclippy::borrow_deref_ref,\n\tunused_parens\n)]\n";

pub struct AppSource {
	pub name: String,
	pub plan: Json,
}

/// Crate name for an app, also its module path in the root binary.
fn crate_name(app_name: &str) -> String {
	let sanitized: String = app_name
		.chars()
		.map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
		.collect();
	format!("app_{sanitized}")
}

fn render_module(plan: &Json) -> Result<(String, String), String> {
	let entry = plan["entry"].as_u64().ok_or("plan is missing entry")? as usize;
	let entry_function = render_function_name(plan, entry)?;
	let mut code = String::new();
	let component_count = plan["components"]
		.as_array()
		.ok_or("plan components")?
		.len();
	for index in 0..component_count {
		code.push_str(
			&generate_component(plan, index)
				.map_err(|reason| format!("component {index}: {reason}"))?,
		);
	}
	let module_count = plan["modules"].as_array().ok_or("plan modules")?.len();
	for module_index in 0..module_count {
		code.push_str(
			&generate_defs(plan, module_index)
				.map_err(|reason| format!("defs {module_index}: {reason}"))?,
		);
	}
	code.push_str(&generate_plugin_fns(plan, "rust")?);
	Ok((code, entry_function))
}

fn absolute(path: &Path) -> Result<PathBuf, String> {
	if path.is_absolute() {
		return Ok(path.to_path_buf());
	}
	std::env::current_dir()
		.map(|cwd| cwd.join(path))
		.map_err(|error| format!("cannot resolve {}: {error}", path.display()))
}

fn write_file(path: &Path, contents: &str) -> Result<(), String> {
	if let Some(parent) = path.parent() {
		std::fs::create_dir_all(parent).map_err(|error| format!("{}: {error}", parent.display()))?;
	}
	std::fs::write(path, contents).map_err(|error| format!("{}: {error}", path.display()))
}

fn app_manifest(name: &str, runtime_crates: &Path) -> String {
	let qwik = runtime_crates.join("qwik");
	let std_crate = runtime_crates.join("qwik-ssr-std");
	format!(
		"# generated\n[package]\nname = {name:?}\nversion = \"0.0.0\"\nedition = \"2021\"\npublish = false\n\n[lib]\npath = \"src/lib.rs\"\n\n[dependencies]\nqwik = {{ path = {:?} }}\nqwik-ssr-std = {{ path = {:?} }}\n",
		qwik.display().to_string(),
		std_crate.display().to_string(),
	)
}

/// Generates the project into `out_dir`. Returns the apps that could not be generated, so the
/// caller can report them; the project still builds, listing them as failures.
pub fn generate_project(
	apps: &[AppSource],
	out_dir: &Path,
	runtime_crates: &Path,
) -> Result<Vec<(String, String)>, String> {
	// manifests are read from their own directory, so every path in them must be absolute
	let out_dir = &absolute(out_dir)?;
	let runtime_crates = &absolute(runtime_crates)?;
	let host_crate = runtime_crates.join("qwik-ssr-host");
	let mut failed = Vec::new();
	let mut members = String::new();
	let mut registry = String::new();

	for app in apps {
		let ident = crate_name(&app.name);
		match render_module(&app.plan) {
			Ok((code, entry_function)) => {
				let crate_dir = out_dir.join("apps").join(&ident);
				write_file(
					&crate_dir.join("Cargo.toml"),
					&app_manifest(&ident, runtime_crates),
				)?;
				write_file(
					&crate_dir.join("src/lib.rs"),
					&format!("//! generated from {}/server/q-ssr-plan.json\n{GENERATED_ALLOW}\n{code}", app.name),
				)?;
				let name = &app.name;
				writeln!(
					members,
					"{ident} = {{ path = {:?} }}",
					crate_dir.display().to_string()
				)
				.unwrap();
				writeln!(
					registry,
					"\tqwik_ssr_host::AppEntry {{ name: {name:?}, render: Some({ident}::{entry_function}), error: None }},"
				)
				.unwrap();
			}
			Err(reason) => {
				let name = &app.name;
				writeln!(
					registry,
					"\tqwik_ssr_host::AppEntry {{ name: {name:?}, render: None, error: Some({reason:?}) }},"
				)
				.unwrap();
				failed.push((app.name.clone(), reason));
			}
		}
	}

	// its own workspace: the repo root workspace would otherwise claim this directory
	write_file(
		&out_dir.join("Cargo.toml"),
		&format!(
			"# generated\n[workspace]\n\n[package]\nname = \"qwik-native-apps\"\nversion = \"0.0.0\"\nedition = \"2021\"\npublish = false\n\n[dependencies]\nqwik-ssr-host = {{ path = {:?} }}\n{members}",
			host_crate.display().to_string()
		),
	)?;
	write_file(
		&out_dir.join("src/main.rs"),
		&format!(
			"//! generated\nstatic APPS: &[qwik_ssr_host::AppEntry] = &[\n{registry}];\n\nfn main() {{\n\tqwik_ssr_host::run(APPS);\n}}\n"
		),
	)?;
	Ok(failed)
}

/// Reads every built app under `apps_dir` (those with `server/q-ssr-plan.json`).
pub fn read_apps(apps_dir: &Path) -> Result<Vec<AppSource>, String> {
	let mut apps = Vec::new();
	let mut dirs: Vec<PathBuf> = std::fs::read_dir(apps_dir)
		.map_err(|error| format!("{}: {error}", apps_dir.display()))?
		.filter_map(|entry| entry.ok())
		.map(|entry| entry.path())
		.filter(|path| path.is_dir())
		.collect();
	dirs.sort();
	for dir in dirs {
		let plan_path = dir.join("server/q-ssr-plan.json");
		if !plan_path.is_file() {
			continue;
		}
		let text = std::fs::read_to_string(&plan_path)
			.map_err(|error| format!("{}: {error}", plan_path.display()))?;
		let plan = serde_json::from_str(&text)
			.map_err(|error| format!("{}: invalid plan JSON: {error}", plan_path.display()))?;
		let name = dir
			.file_name()
			.and_then(|name| name.to_str())
			.ok_or("app directory has no name")?
			.to_string();
		apps.push(AppSource { name, plan });
	}
	Ok(apps)
}
