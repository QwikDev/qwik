use std::ffi::OsStr;
use std::path::Path;
use std::str;

use crate::code_move::new_module;
use crate::collector::global_collect;
use crate::transform::{Hook, HookTransform, TransformContext};
use crate::utils::{CodeHighlight, Diagnostic, DiagnosticSeverity, SourceLocation};
use serde::{Deserialize, Serialize};

#[cfg(feature = "fs")]
use std::fs;

use anyhow::{format_err, Context, Error};
use swc_common::comments::SingleThreadedComments;
use swc_common::errors::{DiagnosticBuilder, Emitter, Handler};
use swc_common::{chain, sync::Lrc, FileName, Globals, Mark, SourceMap};
use swc_ecmascript::ast::*;
use swc_ecmascript::codegen::text_writer::JsWriter;
use swc_ecmascript::minifier::optimize;
use swc_ecmascript::minifier::option::{
    CompressOptions, ExtraOptions, MangleOptions, MinifyOptions,
};
use swc_ecmascript::parser::lexer::Lexer;
use swc_ecmascript::parser::{EsConfig, PResult, Parser, StringInput, Syntax, TsConfig};
use swc_ecmascript::transforms::{
    fixer,
    hygiene::{self, hygiene_with_config},
    resolver_with_mark,
};
use swc_ecmascript::transforms::{optimization::simplify, pass, react, typescript};
use swc_ecmascript::visit::FoldWith;

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HookAnalysis {
    pub origin: String,
    pub name: String,
    pub entry: Option<String>,
    pub canonical_filename: String,
    pub local_decl: Vec<String>,
    pub local_idents: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Copy, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MinifyMode {
    Minify,
    Simplify,
    None,
}

pub struct TransformCodeOptions<'a> {
    pub root_dir: String,
    pub path: String,
    pub source_maps: bool,
    pub minify: MinifyMode,
    pub transpile: bool,
    pub print_ast: bool,
    pub code: &'a str,
    pub context: &'a mut TransformContext,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TransformOuput {
    pub root_dir: String,
    pub modules: Vec<TransformModule>,
    pub diagnostics: Vec<Diagnostic>,
    pub hooks: Vec<HookAnalysis>,
    pub is_type_script: bool,
    pub is_jsx: bool,
}

impl TransformOuput {
    #[cfg(feature = "fs")]
    pub fn write_to_fs(&self, destination: &str) -> Result<usize, Error> {
        let destination = Path::new(destination);
        for module in &self.modules {
            let write_path = destination.join(&module.path);
            fs::create_dir_all(&write_path.parent().with_context(|| {
                format!("Computing path parent of {}", write_path.to_string_lossy())
            })?)?;
            fs::write(write_path, &module.code)?;
        }
        Ok(self.modules.len())
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TransformModule {
    pub path: String,
    pub code: String,

    #[serde(with = "serde_bytes")]
    pub map: Option<Vec<u8>>,

    pub is_entry: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TransformStringResult {
    pub path: String,
    pub code: String,
    pub map: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ErrorBuffer(std::sync::Arc<std::sync::Mutex<Vec<swc_common::errors::Diagnostic>>>);

impl Emitter for ErrorBuffer {
    fn emit(&mut self, db: &DiagnosticBuilder) {
        match self.0.lock() {
            Ok(mut diagnostics) => {
                diagnostics.push((**db).clone());
            }
            Err(_) => {
                eprintln!("Error adquiring error buffer lock; some diagnostics might be dropped.");
            }
        }
    }
}

pub fn transform_code(config: TransformCodeOptions) -> Result<TransformOuput, anyhow::Error> {
    let module = parse(config.code, config.path.as_str(), &config);
    if config.print_ast {
        dbg!(&module);
    }
    let path = parse_path(&config.path)?;
    let transpile = config.transpile;

    match module {
        Ok((main_module, comments, is_type_script, is_jsx)) => {
            let error_buffer = ErrorBuffer::default();
            let handler = swc_common::errors::Handler::with_emitter(
                true,
                false,
                Box::new(error_buffer.clone()),
            );

            swc_common::GLOBALS.set(&Globals::new(), || {
                swc_common::errors::HANDLER.set(&handler, || {
                    let collect = global_collect(&main_module);
                    let mut hooks: Vec<Hook> = vec![];
                    let global_mark = Mark::fresh(Mark::root());
                    let mut react_options = react::Options::default();
                    if is_jsx {
                        react_options.use_spread = true;
                        react_options.import_source = "@builder.io/qwik".to_string();
                        react_options.pragma = "h".to_string();
                        react_options.pragma_frag = "Fragment".to_string();
                    };

                    let top_level_mark = Mark::fresh(Mark::root());
                    let mut main_module = {
                        let mut passes = chain!(
                            pass::Optional::new(
                                typescript::strip(),
                                transpile && is_type_script && !is_jsx
                            ),
                            pass::Optional::new(
                                typescript::strip_with_jsx(
                                    config.context.source_map.clone(),
                                    typescript::Config {
                                        pragma: Some("h".to_string()),
                                        pragma_frag: Some("Fragment".to_string()),
                                        ..Default::default()
                                    },
                                    Some(&comments),
                                    global_mark,
                                ),
                                transpile && is_type_script && is_jsx
                            ),
                            pass::Optional::new(
                                react::react(
                                    config.context.source_map.clone(),
                                    Some(&comments),
                                    react_options,
                                    global_mark
                                ),
                                transpile && is_jsx
                            ),
                            HookTransform::new(config.context, &path, Some(&comments), &mut hooks),
                            pass::Optional::new(
                                resolver_with_mark(top_level_mark),
                                config.minify != MinifyMode::None
                            ),
                            pass::Optional::new(
                                simplify::simplifier(Default::default()),
                                config.minify != MinifyMode::None
                            )
                        );
                        main_module.fold_with(&mut passes)
                    };

                    if config.minify == MinifyMode::Minify {
                        main_module = optimize(
                            main_module,
                            config.context.source_map.clone(),
                            Some(&comments),
                            None,
                            &MinifyOptions {
                                compress: Some(CompressOptions {
                                    ..CompressOptions::default()
                                }),
                                mangle: Some(MangleOptions {
                                    top_level: true,
                                    ..MangleOptions::default()
                                }),
                                rename: true,
                                wrap: false,
                                enclose: false,
                            },
                            &ExtraOptions { top_level_mark },
                        );

                        main_module = main_module
                            .fold_with(&mut hygiene_with_config(hygiene::Config {
                                ..Default::default()
                            }))
                            .fold_with(&mut fixer(None));
                    }

                    let mut output_modules: Vec<TransformModule> = hooks
                        .iter()
                        .map(|hook| -> Result<_, Error> {
                            let (mut hook_module, comments) = new_module(&path, hook, &collect)?;
                            let hook_mark = Mark::fresh(Mark::root());
                            if config.minify == MinifyMode::Minify {
                                hook_module =
                                    hook_module.fold_with(&mut resolver_with_mark(hook_mark));
                                hook_module = optimize(
                                    hook_module,
                                    config.context.source_map.clone(),
                                    None,
                                    None,
                                    &MinifyOptions {
                                        compress: Some(CompressOptions {
                                            ..CompressOptions::default()
                                        }),
                                        mangle: Some(MangleOptions {
                                            top_level: true,
                                            ..MangleOptions::default()
                                        }),
                                        rename: true,
                                        wrap: false,
                                        enclose: false,
                                    },
                                    &ExtraOptions {
                                        top_level_mark: hook_mark,
                                    },
                                );

                                hook_module = hook_module
                                    .fold_with(&mut hygiene_with_config(hygiene::Config {
                                        ..Default::default()
                                    }))
                                    .fold_with(&mut fixer(None));
                            }

                            let (code, map) = emit_source_code(
                                &config.context.source_map,
                                Some(comments),
                                &hook_module,
                                config.minify == MinifyMode::Minify,
                                config.source_maps,
                            )?;
                            let extension = if config.transpile {
                                "js"
                            } else {
                                &path.extension
                            };
                            Ok(TransformModule {
                                code,
                                map,
                                path: format!("{}.{}", hook.canonical_filename, extension),
                                is_entry: hook.entry.is_none(),
                            })
                        })
                        .collect::<Result<_, _>>()?;

                    let hooks: Vec<HookAnalysis> = hooks
                        .iter()
                        .map(|h| HookAnalysis {
                            origin: h.origin.clone(),
                            name: h.name.clone(),
                            entry: h.entry.clone(),
                            canonical_filename: h.canonical_filename.clone(),
                            local_decl: h.local_decl.iter().map(|d| d.to_string()).collect(),
                            local_idents: h.local_idents.iter().map(|d| d.to_string()).collect(),
                        })
                        .collect();

                    let (code, map) = emit_source_code(
                        &config.context.source_map,
                        Some(comments),
                        &main_module,
                        config.minify == MinifyMode::Minify,
                        config.source_maps,
                    )?;

                    let extension = if config.transpile {
                        "js"
                    } else {
                        &path.extension
                    };
                    output_modules.insert(
                        0,
                        TransformModule {
                            path: Path::new(&path.dir)
                                .join(format!("{}.{}", path.file_stem, extension))
                                .to_string_lossy()
                                .into(),
                            code,
                            map,
                            is_entry: false,
                        },
                    );

                    let diagnostics = handle_error(&error_buffer, &config.context.source_map);
                    Ok(TransformOuput {
                        root_dir: config.root_dir.clone(),
                        modules: output_modules,
                        diagnostics,
                        hooks,
                        is_type_script,
                        is_jsx,
                    })
                })
            })
        }
        Err(err) => {
            let error_buffer = ErrorBuffer::default();
            let handler = Handler::with_emitter(true, false, Box::new(error_buffer.clone()));
            err.into_diagnostic(&handler).emit();
            let diagnostics = handle_error(&error_buffer, &config.context.source_map);
            Ok(TransformOuput {
                root_dir: config.root_dir,
                hooks: vec![],
                modules: vec![],
                diagnostics,
                is_type_script: false,
                is_jsx: false,
            })
        }
    }
}

fn parse(
    code: &str,
    filename: &str,
    config: &TransformCodeOptions,
) -> PResult<(Module, SingleThreadedComments, bool, bool)> {
    let source_map = &config.context.source_map;
    let source_file = source_map.new_source_file(FileName::Real(filename.into()), code.into());

    let comments = SingleThreadedComments::default();
    let (is_type_script, is_jsx) = parse_filename(&config.path);
    let syntax = if is_type_script {
        Syntax::Typescript(TsConfig {
            tsx: is_jsx,
            dynamic_import: true,
            ..Default::default()
        })
    } else {
        Syntax::Es(EsConfig {
            jsx: is_jsx,
            dynamic_import: true,
            export_default_from: true,
            export_namespace_from: true,
            import_meta: true,
            ..Default::default()
        })
    };

    let lexer = Lexer::new(
        syntax,
        Default::default(),
        StringInput::from(&*source_file),
        Some(&comments),
    );

    let mut parser = Parser::new_from(lexer);
    match parser.parse_module() {
        Err(err) => Err(err),
        Ok(module) => Ok((module, comments, is_type_script, is_jsx)),
    }
}

fn parse_filename(filename: &str) -> (bool, bool) {
    let extension = Path::new(filename).extension().and_then(OsStr::to_str);
    match extension {
        Some("ts") => (true, false),
        Some("js") => (false, false),
        Some("jsx") => (false, true),
        _ => (true, true),
    }
}

pub fn emit_source_code(
    source_map: &Lrc<SourceMap>,
    comments: Option<SingleThreadedComments>,
    program: &Module,
    minify: bool,
    source_maps: bool,
) -> Result<(String, Option<Vec<u8>>), Error> {
    let mut src_map_buf = Vec::new();
    let mut buf = Vec::new();
    {
        let writer = Box::new(JsWriter::new(
            source_map.clone(),
            "\n",
            &mut buf,
            if source_maps {
                Some(&mut src_map_buf)
            } else {
                None
            },
        ));
        let config = swc_ecmascript::codegen::Config { minify };
        let mut emitter = swc_ecmascript::codegen::Emitter {
            cfg: config,
            comments: Some(&comments),
            cm: source_map.clone(),
            wr: writer,
        };
        emitter.emit_module(program)?;
    }

    let mut map_buf = vec![];
    if source_maps
        && source_map
            .build_source_map(&mut src_map_buf)
            .to_writer(&mut map_buf)
            .is_ok()
    {
        Ok((str::from_utf8(&buf)?.to_string(), Some(map_buf)))
    } else {
        Ok((str::from_utf8(&buf)?.to_string(), None))
    }
}

fn handle_error(error_buffer: &ErrorBuffer, source_map: &Lrc<SourceMap>) -> Vec<Diagnostic> {
    error_buffer
        .0
        .lock()
        .map(|diagnostics| diagnostics.clone())
        .ok()
        .unwrap_or_else(Vec::new)
        .iter()
        .map(|diagnostic| {
            let message = diagnostic.message();
            let span = diagnostic.span.clone();
            let suggestions = diagnostic.suggestions.clone();

            let span_labels = span.span_labels();
            let code_highlights = if !span_labels.is_empty() {
                let mut highlights = vec![];
                for span_label in span_labels {
                    highlights.push(CodeHighlight {
                        message: span_label.label,
                        loc: SourceLocation::from(source_map, span_label.span),
                    });
                }

                Some(highlights)
            } else {
                None
            };

            let hints = if !suggestions.is_empty() {
                Some(
                    suggestions
                        .into_iter()
                        .map(|suggestion| suggestion.msg)
                        .collect(),
                )
            } else {
                None
            };

            Diagnostic {
                message,
                code_highlights,
                hints,
                show_environment: false,
                severity: DiagnosticSeverity::Error,
                documentation_url: None,
            }
        })
        .collect()
}

pub struct PathData {
    pub path: String,
    pub dir: String,
    pub file_stem: String,
    pub extension: String,
    pub file_name: String,
    pub basename: String,
}

pub fn parse_path(src: &str) -> Result<PathData, Error> {
    let path = Path::new(src);
    let file_stem = path
        .file_stem()
        .and_then(|f| f.to_str())
        .map(Into::into)
        .with_context(|| format!("Computing file stem for {}", path.to_string_lossy()))?;

    let dir = path.parent().and_then(|p| p.to_str()).unwrap_or("");
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let file_name = path
        .file_name()
        .and_then(|p| p.to_str())
        .with_context(|| format!("Computing filename for {}", path.to_string_lossy()))?;
    let basename = file_name
        .rsplitn(2, '.')
        .last()
        .with_context(|| format!("Computing basename for {}", path.to_string_lossy()))?;

    // let file_prefix = if let Some(index) = file_name.find('.') {
    //     file_name[0..index].to_string()
    // } else {
    //     file_name.clone()
    // };

    Ok(PathData {
        path: src.into(),
        dir: dir.into(),
        file_stem,
        extension: extension.into(),
        file_name: file_name.into(),
        basename: basename.into(),
    })
}
