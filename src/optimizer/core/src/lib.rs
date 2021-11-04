#![warn(clippy::all)]
#![warn(clippy::perf)]
#![warn(clippy::nursery)]

#[cfg(test)]
mod test;

mod bundling;
mod code_move;
mod collector;
mod parse;
mod transform;
mod utils;

use std::error;
use std::fs;
use std::path::PathBuf;
use std::str;
use std::collections::HashSet;

use crate::bundling::parse_bundling;
use crate::parse::{transform_internal, InternalConfig, parse_path};
use crate::utils::{MapVec};
pub use crate::bundling::Bundling;
pub use crate::parse::{ErrorBuffer, HookAnalysis, TransformResult, TransformModule};
pub use crate::transform::{Hook, TransformContext};

use serde::{Deserialize, Serialize};

#[derive(Serialize, Debug, Deserialize)]
pub struct FSConfig {
    pub input: String,
    pub glob: Option<String>,
    pub source_maps: bool,
    pub minify: bool,
    pub transpile: bool,
    pub bundling: Bundling,
}

#[derive(Serialize, Debug, Deserialize)]
pub struct FileInput {
    pub path: String,
    pub code: Vec<u8>,
}

#[derive(Serialize, Debug, Deserialize)]
pub struct MultiConfig {
    pub input: Vec<FileInput>,
    pub source_maps: bool,
    pub minify: bool,
    pub transpile: bool,
    pub print_ast: bool,
    pub bundling: Bundling,
}

pub fn transform_workdir(config: &FSConfig) -> Result<TransformResult, Box<dyn error::Error>> {
    let srcdir = PathBuf::from(&config.input);
    let pattern = if let Some(glob) = &config.glob {
        srcdir.join(glob)
    } else {
        srcdir.join("**/*.qwik.*")
    };

    let bundling = parse_bundling(&config.bundling);
    let mut context = TransformContext::new(bundling);
    let paths = glob::glob(pattern.to_str().unwrap())?;
    let mut output = TransformResult {
        project_root: Some(srcdir.to_str().unwrap().to_string()),
        ..TransformResult::default()
    };
    for p in paths {
        let value = p.unwrap();
        let pathstr = value.to_str().unwrap();
        let data = fs::read(&value).expect("Unable to read file");
        let mut result = transform_internal(InternalConfig {
            project_root: None,
            path: pathstr.to_string(),
            minify: config.minify,
            code: &data,
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
            }
            Err(err) => {
                return Err(err);
            }
        }
    }
    Ok(output)
}

pub fn transform_input(config: &MultiConfig) -> Result<TransformResult, Box<dyn error::Error>> {
    let bundling = parse_bundling(&config.bundling);
    let mut context = TransformContext::new(bundling);
    let mut output = TransformResult::default();
    for p in &config.input {
        let mut result = transform_internal(InternalConfig {
            project_root: None,
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
            }
            Err(err) => {
                return Err(err);
            }
        }
    }

    Ok(output)
}

pub struct TransformEntryResult {
    pub project_root: Option<String>,
    pub modules: Vec<TransformModule>,
    pub diagnostics: Vec<Diagnostic>,
    pub hooks: Vec<HookAnalysis>,
}

fn generate_entries(result: &TransformResult) {
    let mut entries_set = HashSet::new();
    let mut entries_map = MapVec::new();
    for hook in &hooks {
        let mut entry = hook.canonical_filename;
        if let Some(e) = hook.entry {
            entries_map.push(e, hook);
            entry = e;
        }
        entries_set.insert(entry);
    }
}