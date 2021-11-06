#![warn(clippy::all)]
#![warn(clippy::perf)]
#![warn(clippy::nursery)]

#[cfg(test)]
mod test;

mod code_move;
mod collector;
mod entry_strategy;
mod parse;
mod transform;
mod utils;

use std::collections::HashSet;
use std::error;
use std::fs;
use std::path::PathBuf;
use std::str;
use swc_atoms::JsWord;
use swc_common::{sync::Lrc, SourceMap, DUMMY_SP};
use swc_ecmascript::ast::*;

use crate::entry_strategy::parse_entry_strategy;
pub use crate::entry_strategy::EntryStrategy;
use crate::parse::{emit_source_code, transform_internal, InternalConfig};
pub use crate::parse::{ErrorBuffer, HookAnalysis, MinifyMode, TransformModule, TransformResult};
pub use crate::transform::{Hook, TransformContext};
use crate::utils::MapVec;

use serde::{Deserialize, Serialize};

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
    pub print_ast: bool,
    pub entry_strategy: EntryStrategy,
}

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
        let mut result = transform_internal(InternalConfig {
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
        let mut result = transform_internal(InternalConfig {
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

fn generate_entries(
    result: TransformResult,
    default_ext: &str,
    source_map: Lrc<SourceMap>,
) -> TransformResult {
    let mut result = result;
    let mut entries_set = HashSet::new();
    let mut entries_map = MapVec::new();
    for hook in &result.hooks {
        let entry = if let Some(ref e) = hook.entry {
            e.clone()
        } else {
            hook.canonical_filename.clone()
        };
        if hook.entry != None {
            entries_map.push(entry.clone(), hook);
        }
        entries_set.insert(entry);
    }

    for (entry, hooks) in entries_map.as_ref().iter() {
        let module = new_entry_module(hooks);
        let (code, map) =
            emit_source_code(source_map.clone(), None, &module, false, false).unwrap();
        result.modules.push(TransformModule {
            path: [entry, ".", default_ext].concat(),
            code,
            map,
            is_entry: true,
        });
    }
    result
}

fn new_entry_module(hooks: &[&HookAnalysis]) -> Module {
    let mut module = Module {
        span: DUMMY_SP,
        body: vec![],
        shebang: None,
    };
    for hook in hooks {
        module
            .body
            .push(ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(
                NamedExport {
                    span: DUMMY_SP,
                    type_only: false,
                    asserts: None,
                    src: Some(Str {
                        span: DUMMY_SP,
                        value: JsWord::from(["./", &hook.canonical_filename].concat()),
                        kind: StrKind::Synthesized,
                        has_escape: false,
                    }),
                    specifiers: vec![ExportSpecifier::Named(ExportNamedSpecifier {
                        is_type_only: false,
                        span: DUMMY_SP,
                        orig: Ident::new(JsWord::from(hook.name.clone()), DUMMY_SP),
                        exported: None,
                    })],
                },
            )));
    }

    module
}
