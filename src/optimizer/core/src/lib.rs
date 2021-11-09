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
use std::error;

// #[cfg(feature = "fs")]
use std::fs;

// #[cfg(feature = "fs")]
use std::path::Path;

use serde::{Deserialize, Serialize};
use std::str;
use swc_common::sync::Lrc;

use crate::code_move::generate_entries;
use crate::entry_strategy::parse_entry_strategy;
pub use crate::entry_strategy::EntryStrategy;
use crate::parse::{transform_code, TransformCodeOptions};
pub use crate::parse::{ErrorBuffer, HookAnalysis, MinifyMode, TransformModule, TransformResult};
use crate::transform::TransformContext;

// #[cfg(feature = "fs")]
#[derive(Serialize, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformFsOptions {
    pub root_dir: String,
    pub glob: Option<String>,
    pub source_maps: bool,
    pub minify: MinifyMode,
    pub transpile: bool,
    pub entry_strategy: EntryStrategy,
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
pub fn transform_fs(config: TransformFsOptions) -> Result<TransformResult, Box<dyn error::Error>> {
    let root_dir = Path::new(&config.root_dir);
    let bundling = parse_entry_strategy(config.entry_strategy);
    let mut context = TransformContext::new(bundling);
    let mut paths = vec![];
    find_files(root_dir, &mut paths)?;

    let mut output = TransformResult::new();
    let mut default_ext = "js";
    for value in paths {
        let pathstr = value.strip_prefix(root_dir)?;
        let data = fs::read(&value)?;
        let mut result = transform_code(TransformCodeOptions {
            path: pathstr.to_str().unwrap(),
            minify: config.minify,
            code: unsafe { std::str::from_utf8_unchecked(&data) },
            source_maps: config.source_maps,
            transpile: config.transpile,
            print_ast: false,
            context: &mut context,
        });
        match result {
            Ok(ref mut result) => {
                output.modules.append(&mut result.modules);
                output.hooks.append(&mut result.hooks);
                output.diagnostics.append(&mut result.diagnostics);
                if !config.transpile && result.is_type_script {
                    default_ext = "ts";
                }
            }
            Err(err) => {
                return Err(err);
            }
        }
    }

    Ok(generate_entries(
        output,
        default_ext,
        Lrc::clone(&context.source_map),
    ))
}

pub fn transform_modules(
    config: TransformModulesOptions,
) -> Result<TransformResult, Box<dyn error::Error>> {
    let bundling = parse_entry_strategy(config.entry_strategy);
    let mut context = TransformContext::new(bundling);
    let mut output = TransformResult::new();
    let mut default_ext = "js";
    for p in &config.input {
        let mut result = transform_code(TransformCodeOptions {
            path: &p.path,
            minify: config.minify,
            code: &p.code,
            source_maps: config.source_maps,
            transpile: config.transpile,
            print_ast: false,
            context: &mut context,
        });
        match result {
            Ok(ref mut result) => {
                output.append(result);
                if !config.transpile && result.is_type_script {
                    default_ext = "ts";
                }
            }
            Err(err) => {
                return Err(err);
            }
        }
    }

    Ok(generate_entries(
        output,
        default_ext,
        Lrc::clone(&context.source_map),
    ))
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
