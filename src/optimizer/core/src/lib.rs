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

// #[cfg(feature = "fs")]
use std::fs;

// #[cfg(feature = "fs")]
use std::path::Path;

use anyhow::{Context, Error};
use serde::{Deserialize, Serialize};
use std::str;
use swc_common::sync::Lrc;

use crate::code_move::generate_entries;
use crate::entry_strategy::parse_entry_strategy;
pub use crate::entry_strategy::EntryStrategy;
use crate::parse::{transform_code, TransformCodeOptions};
pub use crate::parse::{ErrorBuffer, HookAnalysis, MinifyMode, TransformModule, TransformOutput};
use crate::transform::TransformContext;

// #[cfg(feature = "fs")]
#[derive(Serialize, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformFsOptions {
    root_dir: String,
    glob: Option<String>,
    source_maps: bool,
    minify: MinifyMode,
    transpile: bool,
    entry_strategy: EntryStrategy,
}

impl TransformFsOptions {
    pub fn new(
        root_dir: String,
        glob: Option<String>,
        source_maps: bool,
        minify: MinifyMode,
        transpile: bool,
        entry_strategy: EntryStrategy,
    ) -> Self {
        Self {
            root_dir,
            glob,
            source_maps,
            minify,
            transpile,
            entry_strategy,
        }
    }
}

#[derive(Serialize, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformModuleInput {
    pub path: String,
    pub code: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformModulesOptions {
    pub root_dir: String,
    pub input: Vec<TransformModuleInput>,
    pub source_maps: bool,
    pub minify: MinifyMode,
    pub transpile: bool,
    pub entry_strategy: EntryStrategy,
}

// #[cfg(feature = "fs")]
pub fn transform_fs(config: TransformFsOptions) -> Result<TransformOutput, Error> {
    let root_dir = Path::new(&config.root_dir);
    let bundling = parse_entry_strategy(config.entry_strategy);
    let mut context = TransformContext::new(bundling);
    let mut paths = vec![];
    find_files(root_dir, &mut paths)?;

    let mut final_output = TransformOutput::new();
    let mut default_ext = "js";
    for path in paths {
        let code = fs::read_to_string(&path)
            .with_context(|| format!("Opening {}", &path.to_string_lossy()))?;
        let mut result = transform_code(TransformCodeOptions {
            path: path
                .strip_prefix(&config.root_dir)
                .with_context(|| format!("Stripping root prefix from {}", path.to_string_lossy()))?
                .to_str()
                .unwrap(),
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

    generate_entries(final_output, default_ext, Lrc::clone(&context.source_map))
}

pub fn transform_modules(config: TransformModulesOptions) -> Result<TransformOutput, Error> {
    let bundling = parse_entry_strategy(config.entry_strategy);
    let mut context = TransformContext::new(bundling);
    let mut final_output = TransformOutput::new();
    let mut default_ext = "js";
    for p in &config.input {
        let mut output = transform_code(TransformCodeOptions {
            path: &p.path,
            minify: config.minify,
            code: &p.code,
            source_maps: config.source_maps,
            transpile: config.transpile,
            print_ast: false,
            context: &mut context,
        })?;
        final_output.append(&mut output);

        if !config.transpile && output.is_type_script {
            default_ext = "ts";
        }
    }

    generate_entries(final_output, default_ext, Lrc::clone(&context.source_map))
}

// #[cfg(feature = "fs")]
fn find_files(dir: &std::path::Path, files: &mut Vec<std::path::PathBuf>) -> std::io::Result<()> {
    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                match path.file_name().and_then(|p| p.to_str()) {
                    Some("node_modules" | "dist" | "build") => {}
                    _ => {
                        find_files(&path, files)?;
                    }
                }
            } else {
                let ext = path.extension().and_then(|p| p.to_str());
                if let Some("ts" | "tsx" | "js" | "jsx") = ext {
                    files.push(path);
                }
            }
        }
    }
    Ok(())
}
