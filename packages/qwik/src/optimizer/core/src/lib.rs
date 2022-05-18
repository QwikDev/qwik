#![deny(clippy::all)]
#![deny(clippy::perf)]
#![deny(clippy::nursery)]

#[cfg(test)]
mod test;

mod code_move;
mod collector;
mod entry_strategy;
mod parse;
mod transform;
mod utils;
mod words;

#[cfg(feature = "parallel")]
use rayon::prelude::*;

#[cfg(feature = "parallel")]
use anyhow::Context;

#[cfg(feature = "fs")]
use std::fs;

#[cfg(feature = "fs")]
use std::path::Path;

use anyhow::Error;
use serde::{Deserialize, Serialize};
use std::str;

use crate::code_move::generate_entries;
use crate::entry_strategy::parse_entry_strategy;
pub use crate::entry_strategy::EntryStrategy;
use crate::parse::{transform_code, TransformCodeOptions};
pub use crate::parse::{ErrorBuffer, HookAnalysis, MinifyMode, TransformModule, TransformOutput};

// #[cfg(feature = "fs")]
#[derive(Serialize, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformFsOptions {
    pub root_dir: String,
    pub glob: Option<String>,
    pub minify: MinifyMode,
    pub entry_strategy: EntryStrategy,
    pub source_maps: bool,
    pub transpile: bool,
    pub explicity_extensions: bool,
    pub dev: bool,
    pub scope: Option<String>,
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
    pub explicity_extensions: bool,
    pub dev: bool,
    pub scope: Option<String>,
}

#[cfg(feature = "fs")]
pub fn transform_fs(config: TransformFsOptions) -> Result<TransformOutput, Error> {
    let root_dir = Path::new(&config.root_dir);
    let mut paths = vec![];
    let is_inline = matches!(config.entry_strategy, EntryStrategy::Inline);
    let entry_policy = &*parse_entry_strategy(config.entry_strategy);
    find_files(root_dir, &mut paths)?;

    #[cfg(feature = "parallel")]
    let iterator = paths.par_iter();

    #[cfg(not(feature = "parallel"))]
    let iterator = paths.iter();
    let mut final_output = iterator
        .map(|path| -> Result<TransformOutput, Error> {
            let code = fs::read_to_string(&path)
                .with_context(|| format!("Opening {}", &path.to_string_lossy()))?;

            transform_code(TransformCodeOptions {
                path: path
                    .strip_prefix(&config.root_dir)
                    .with_context(|| {
                        format!("Stripping root prefix from {}", path.to_string_lossy())
                    })?
                    .to_str()
                    .unwrap(),
                minify: config.minify,
                code: &code,
                explicity_extensions: config.explicity_extensions,
                source_maps: config.source_maps,
                transpile: config.transpile,
                print_ast: false,
                scope: config.scope.as_ref(),
                entry_policy,
                dev: config.dev,
                is_inline,
            })
        })
        .reduce(|| Ok(TransformOutput::new()), |x, y| Ok(x?.append(&mut y?)))?;

    final_output.modules.sort_unstable_by_key(|key| key.order);
    final_output = generate_entries(final_output, config.explicity_extensions)?;
    Ok(final_output)
}

pub fn transform_modules(config: TransformModulesOptions) -> Result<TransformOutput, Error> {
    let is_inline = matches!(config.entry_strategy, EntryStrategy::Inline);
    let entry_policy = &*parse_entry_strategy(config.entry_strategy);
    #[cfg(feature = "parallel")]
    let iterator = config.input.par_iter();

    #[cfg(not(feature = "parallel"))]
    let iterator = config.input.iter();
    let iterator = iterator.map(|path| -> Result<TransformOutput, Error> {
        transform_code(TransformCodeOptions {
            path: &path.path,
            code: &path.code,
            minify: config.minify,
            source_maps: config.source_maps,
            transpile: config.transpile,
            explicity_extensions: config.explicity_extensions,
            print_ast: false,
            entry_policy,
            dev: config.dev,
            scope: config.scope.as_ref(),
            is_inline,
        })
    });

    #[cfg(feature = "parallel")]
    let final_output: Result<TransformOutput, Error> =
        iterator.reduce(|| Ok(TransformOutput::new()), |x, y| Ok(x?.append(&mut y?)));

    #[cfg(not(feature = "parallel"))]
    let final_output: Result<TransformOutput, Error> =
        iterator.fold(Ok(TransformOutput::new()), |x, y| Ok(x?.append(&mut y?)));

    let mut final_output = final_output?;
    final_output.modules.sort_unstable_by_key(|key| key.order);
    final_output = generate_entries(final_output, config.explicity_extensions)?;

    Ok(final_output)
}

#[cfg(feature = "fs")]
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
