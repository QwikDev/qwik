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

use std::collections::HashSet;
use std::error;
use std::fs;
use std::path::{Path, PathBuf};
use std::str;
use swc_atoms::JsWord;
use swc_common::{sync::Lrc, SourceMap, DUMMY_SP};
use swc_ecmascript::ast::*;

use crate::bundling::parse_bundling;
pub use crate::bundling::Bundling;
use crate::parse::{emit_source_code, transform_internal, InternalConfig};
pub use crate::parse::{ErrorBuffer, HookAnalysis, TransformModule, TransformResult};
pub use crate::transform::{Hook, TransformContext};
use crate::utils::MapVec;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Debug, Deserialize)]
pub struct FSConfig {
    pub project_root: String,
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
    pub project_root: String,
    pub input: Vec<FileInput>,
    pub source_maps: bool,
    pub minify: bool,
    pub transpile: bool,
    pub print_ast: bool,
    pub bundling: Bundling,
}

pub fn transform_workdir(config: &FSConfig) -> Result<TransformResult, Box<dyn error::Error>> {
    let project_root = PathBuf::from(&config.project_root);
    let pattern = if let Some(glob) = &config.glob {
        project_root.join(glob)
    } else {
        project_root.join("**/*.qwik.*")
    };

    let bundling = parse_bundling(&config.bundling);
    let mut context = TransformContext::new(bundling);
    let paths = glob::glob(pattern.to_str().unwrap())?;
    let mut output = TransformResult {
        project_root: config.project_root.clone(),
        ..TransformResult::default()
    };
    let mut default_ext = "js";
    for p in paths {
        let value = p.unwrap();
        let pathstr = value.strip_prefix(&project_root)?.to_str().unwrap();
        let data = fs::read(&value).expect("Unable to read file");
        let mut result = transform_internal(InternalConfig {
            project_root: config.project_root.clone(),
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

pub fn transform_input(config: &MultiConfig) -> Result<TransformResult, Box<dyn error::Error>> {
    let bundling = parse_bundling(&config.bundling);
    let mut context = TransformContext::new(bundling);
    let mut output = TransformResult {
        project_root: config.project_root.clone(),
        ..TransformResult::default()
    };
    let mut default_ext = "js";
    for p in &config.input {
        let mut result = transform_internal(InternalConfig {
            project_root: config.project_root.clone(),
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

    let dir = Path::new(&result.project_root);
    for (entry, hooks) in entries_map.as_ref().iter() {
        let module = new_entry_module(hooks);
        let (code, map) =
            emit_source_code(source_map.clone(), None, &module, false, false).unwrap();
        result.modules.push(TransformModule {
            path: dir
                .join(format!("{}.{}", entry.to_string(), default_ext))
                .to_str()
                .unwrap()
                .to_string(),
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
                        value: JsWord::from(format!("./{}", hook.canonical_filename)),
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
