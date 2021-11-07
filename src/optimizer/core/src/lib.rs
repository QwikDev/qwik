#![deny(clippy::all)]
#![deny(clippy::perf)]
#![deny(clippy::nursery)]
#![deny(clippy::cargo)]

#[cfg(test)]
mod test;

mod code_move;
mod collector;
mod entry_strategy;
mod parse;
mod transform;
mod utils;
use std::error;

#[cfg(feature = "fs")]
use std::fs;
#[cfg(feature = "fs")]
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use std::str;

use crate::code_move::generate_entries;
use crate::entry_strategy::parse_entry_strategy;
pub use crate::entry_strategy::EntryStrategy;
use crate::parse::{transform_code, TransformCodeOptions};
pub use crate::parse::{ErrorBuffer, HookAnalysis, MinifyMode, TransformModule, TransformResult};
use crate::transform::TransformContext;

#[cfg(feature = "fs")]
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

#[cfg(feature = "fs")]
pub fn transform_fs(config: &TransformFsOptions) -> Result<TransformResult, Box<dyn error::Error>> {
    let root_dir = PathBuf::from(&config.root_dir);
    let pattern = if let Some(glob) = &config.glob {
        root_dir.join(glob)
    } else {
        root_dir.join("**/*.qwik.*")
    };

    let bundling = parse_entry_strategy(&config.entry_strategy);
    let mut context = TransformContext::new(bundling);
    let paths = glob::glob(pattern.to_str().unwrap())?;
    let mut output = TransformResult {
        root_dir: config.root_dir.clone(),
        ..TransformResult::default()
    };
    let mut default_ext = "js";
    for p in paths {
        let value = p.unwrap();
        let pathstr = value.strip_prefix(&root_dir)?.to_str().unwrap();
        let data = fs::read(&value).expect("Unable to read file");
        let mut result = transform_code(TransformCodeOptions {
            root_dir: config.root_dir.clone(),
            path: pathstr.to_string(),
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
        context.source_map.clone(),
    ))
}

pub fn transform_modules(
    config: &TransformModulesOptions,
) -> Result<TransformResult, Box<dyn error::Error>> {
    let bundling = parse_entry_strategy(&config.entry_strategy);
    let mut context = TransformContext::new(bundling);
    let mut output = TransformResult {
        root_dir: config.root_dir.clone(),
        ..TransformResult::default()
    };
    let mut default_ext = "js";
    for p in &config.input {
        let mut result = transform_code(TransformCodeOptions {
            root_dir: config.root_dir.clone(),
            path: p.path.clone(),
            minify: config.minify,
            code: &p.code,
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
        context.source_map.clone(),
    ))
}
