#![deny(clippy::all)]
#![deny(clippy::perf)]
#![deny(clippy::nursery)]
// #![deny(clippy::cargo)]

#[cfg(test)]
mod test;

mod code_move;
mod collector;
mod entry_strategy;
mod parse;
mod transform;
mod utils;

#[cfg(feature = "fs")]
use std::fs;
#[cfg(feature = "fs")]
use std::path::PathBuf;

use anyhow::{format_err, Context, Error};
use serde::{Deserialize, Serialize};

use crate::code_move::generate_entries;
use crate::entry_strategy::parse_entry_strategy;
pub use crate::entry_strategy::EntryStrategy;
use crate::parse::{transform_code, TransformCodeOptions};
pub use crate::parse::{ErrorBuffer, HookAnalysis, MinifyMode, TransformModule, TransformOuput};
use crate::transform::TransformContext;

#[cfg(feature = "fs")]
#[derive(Serialize, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformFsOptions {
    root_dir: PathBuf,
    glob: Option<String>,
    source_maps: bool,
    minify: MinifyMode,
    transpile: bool,
    entry_strategy: EntryStrategy,
}

impl TransformFsOptions {
    pub fn new(
        root_dir: PathBuf,
        glob: Option<String>,
        source_maps: bool,
        minify: MinifyMode,
        transpile: bool,
        entry_strategy: EntryStrategy,
    ) -> Result<Self, Error> {
        if let Some(ref pattern) = glob {
            glob::glob(pattern)?;
        }

        Ok(Self {
            root_dir,
            glob,
            source_maps,
            minify,
            transpile,
            entry_strategy,
        })
    }
}

#[derive(Serialize, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformModuleInput {
    pub path: PathBuf,
    pub code: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformModulesOptions {
    pub root_dir: PathBuf,
    pub input: Vec<TransformModuleInput>,
    pub source_maps: bool,
    pub minify: MinifyMode,
    pub transpile: bool,
    pub entry_strategy: EntryStrategy,
}

#[cfg(feature = "fs")]
pub fn transform_fs(config: &TransformFsOptions) -> Result<TransformOuput, Error> {
    let pattern =
        PathBuf::from(&config.root_dir).join(config.glob.as_deref().unwrap_or("**/*.qwik.*"));

    let bundling = parse_entry_strategy(&config.entry_strategy);
    let mut context = TransformContext::new(bundling);
    let mut final_output = TransformOuput {
        root_dir: config.root_dir.clone(),
        ..TransformOuput::default()
    };
    let paths = glob::glob(pattern.to_str().context("Extracting GLOB pattern")?)
        .context("Parsing GLOB pattern")?;
    let mut default_ext = "js";
    // for path in paths.into_iter().collect::<Result<_, anyhow::Error>>() {
    for path in paths.into_iter().collect::<Result<Vec<_>, _>>()? {
        let code = fs::read_to_string(&path)
            .with_context(|| format!("Opening {}", &path.to_string_lossy()))?;
        let mut result = transform_code(TransformCodeOptions {
            root_dir: config.root_dir.clone(),
            path: path
                .strip_prefix(&config.root_dir)
                .with_context(|| format!("Stripping root prefix from {}", path.to_string_lossy()))?
                .into(),
            minify: config.minify,
            code: &code,
            source_maps: config.source_maps,
            transpile: config.transpile,
            print_ast: false,
            context: &mut context,
        })?;
        final_output.modules.append(&mut result.modules);
        final_output.hooks.append(&mut result.hooks);
        final_output.diagnostics.append(&mut result.diagnostics);
        if !config.transpile && result.is_type_script {
            default_ext = "ts";
        }
    }

    generate_entries(final_output, default_ext, &context.source_map)
}

pub fn transform_modules(config: &TransformModulesOptions) -> Result<TransformOuput, Error> {
    let bundling = parse_entry_strategy(&config.entry_strategy);
    let mut context = TransformContext::new(bundling);
    let mut final_output = TransformOuput {
        root_dir: config.root_dir.clone(),
        ..TransformOuput::default()
    };
    let mut default_ext = "js";
    for p in &config.input {
        let mut output = transform_code(TransformCodeOptions {
            root_dir: config.root_dir.clone(),
            path: p.path.clone(),
            minify: config.minify,
            code: &p.code,
            source_maps: config.source_maps,
            transpile: config.transpile,
            print_ast: false,
            context: &mut context,
        })?;
        final_output.modules.append(&mut output.modules);
        final_output.hooks.append(&mut output.hooks);
        final_output.diagnostics.append(&mut output.diagnostics);
        if !config.transpile && output.is_type_script {
            default_ext = "ts";
        }
    }

    generate_entries(final_output, default_ext, &context.source_map)
}
