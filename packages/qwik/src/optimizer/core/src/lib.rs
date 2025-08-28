#![deny(clippy::all)]
#![deny(clippy::perf)]
#![deny(clippy::nursery)]
#![allow(clippy::use_self)]
#![feature(box_patterns)]
#![allow(clippy::option_if_let_else)]
#![allow(clippy::iter_with_drain)]
#[cfg(test)]
mod test;

mod add_side_effect;
mod clean_side_effects;
mod code_move;
mod collector;
mod const_replace;
mod entry_strategy;
mod errors;
mod filter_exports;
mod inlined_fn;
mod is_const;
mod parse;
mod props_destructuring;
mod rename_imports;
mod transform;
mod utils;
mod words;

use words::BUILDER_IO_QWIK;

use anyhow::Error;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::str;
use swc_atoms::Atom;

use crate::entry_strategy::parse_entry_strategy;
pub use crate::entry_strategy::EntryStrategy;
pub use crate::parse::EmitMode;
use crate::parse::{transform_code, TransformCodeOptions};
pub use crate::parse::{
	ErrorBuffer, MinifyMode, SegmentAnalysis, TransformModule, TransformOutput,
};
#[derive(Serialize, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformModuleInput {
	pub path: String,
	pub dev_path: Option<String>,
	pub code: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformModulesOptions {
	pub src_dir: String,
	pub root_dir: Option<String>,
	pub input: Vec<TransformModuleInput>,
	pub source_maps: bool,
	pub minify: MinifyMode,
	pub transpile_ts: bool,
	pub transpile_jsx: bool,
	pub preserve_filenames: bool,
	pub entry_strategy: EntryStrategy,
	pub explicit_extensions: bool,
	pub mode: EmitMode,
	pub scope: Option<String>,

	pub core_module: Option<String>,
	pub strip_exports: Option<Vec<Atom>>,
	pub strip_ctx_name: Option<Vec<Atom>>,
	pub strip_event_handlers: bool,
	pub reg_ctx_name: Option<Vec<Atom>>,
	pub is_server: Option<bool>,
}

pub fn transform_modules(config: TransformModulesOptions) -> Result<TransformOutput, Error> {
	let core_module = config
		.core_module
		.map_or_else(|| BUILDER_IO_QWIK.clone(), |s| s.into());
	let src_dir = std::path::Path::new(&config.src_dir);
	let root_dir = config.root_dir.as_ref().map(Path::new);

	let entry_policy = &*parse_entry_strategy(&config.entry_strategy);

	let iterator = config.input.iter();

	let iterator = iterator.map(|input| -> Result<TransformOutput, Error> {
		transform_code(TransformCodeOptions {
			src_dir,
			root_dir,
			relative_path: &input.path,
			dev_path: input.dev_path.as_deref(),
			code: &input.code,
			minify: config.minify,
			source_maps: config.source_maps,
			transpile_ts: config.transpile_ts,
			transpile_jsx: config.transpile_jsx,
			preserve_filenames: config.preserve_filenames,
			explicit_extensions: config.explicit_extensions,
			entry_policy,
			mode: config.mode,
			scope: config.scope.as_ref(),
			core_module: core_module.clone(),
			entry_strategy: config.entry_strategy,
			reg_ctx_name: config.reg_ctx_name.as_deref(),
			strip_exports: config.strip_exports.as_deref(),
			strip_ctx_name: config.strip_ctx_name.as_deref(),
			strip_event_handlers: config.strip_event_handlers,
			// If you don't specify is_server, the safe value is true
			is_server: config.is_server.unwrap_or(true),
		})
	});

	#[allow(clippy::manual_try_fold)]
	let final_output: Result<TransformOutput, Error> =
		iterator.fold(Ok(TransformOutput::new()), |x, y| Ok(x?.append(&mut y?)));

	let mut final_output = final_output?;
	final_output.modules.sort_unstable_by_key(|key| key.order);

	Ok(final_output)
}
