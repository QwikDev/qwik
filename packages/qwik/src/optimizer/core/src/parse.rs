use std::collections::hash_map::DefaultHasher;
use std::ffi::OsStr;
use std::hash::Hasher;
use std::path::{Path, PathBuf};
use std::str;

use crate::code_move::{new_module, NewModuleCtx};
use crate::collector::global_collect;
use crate::entry_strategy::EntryPolicy;
use crate::transform::{HookKind, QwikTransform, QwikTransformOptions};
use crate::utils::{CodeHighlight, Diagnostic, DiagnosticSeverity, SourceLocation};
use path_slash::PathExt;
use serde::{Deserialize, Serialize};

#[cfg(feature = "fs")]
use std::fs;

use anyhow::{Context, Error};

use swc_atoms::JsWord;
use swc_common::comments::SingleThreadedComments;
use swc_common::errors::{DiagnosticBuilder, Emitter, Handler};
use swc_common::{sync::Lrc, FileName, Globals, Mark, SourceMap};
use swc_ecmascript::ast;
use swc_ecmascript::codegen::text_writer::JsWriter;
use swc_ecmascript::parser::lexer::Lexer;
use swc_ecmascript::parser::{EsConfig, PResult, Parser, StringInput, Syntax, TsConfig};
use swc_ecmascript::transforms::{
    fixer, hygiene::hygiene_with_config, optimization::simplify, react, resolver, typescript,
};
use swc_ecmascript::visit::{FoldWith, VisitMutWith};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HookAnalysis {
    pub origin: JsWord,
    pub name: JsWord,
    pub entry: Option<JsWord>,
    pub display_name: JsWord,
    pub hash: JsWord,
    pub canonical_filename: JsWord,
    pub extension: JsWord,
    pub parent: Option<JsWord>,
    pub ctx_kind: HookKind,
    pub ctx_name: JsWord,
    pub captures: bool,
    pub loc: (u32, u32),
}

#[derive(Debug, Serialize, Deserialize, Copy, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MinifyMode {
    Simplify,
    None,
}

pub struct TransformCodeOptions<'a> {
    pub path: &'a str,
    pub source_maps: bool,
    pub minify: MinifyMode,
    pub transpile: bool,
    pub print_ast: bool,
    pub explicity_extensions: bool,
    pub code: &'a str,
    pub entry_policy: &'a dyn EntryPolicy,
    pub dev: bool,
    pub scope: Option<&'a String>,
    pub is_inline: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TransformOutput {
    pub modules: Vec<TransformModule>,
    pub diagnostics: Vec<Diagnostic>,
    pub is_type_script: bool,
    pub is_jsx: bool,
}

impl TransformOutput {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn append(mut self, output: &mut Self) -> Self {
        self.modules.append(&mut output.modules);
        self.diagnostics.append(&mut output.diagnostics);
        self.is_type_script = self.is_type_script || output.is_type_script;
        self.is_jsx = self.is_jsx || output.is_jsx;
        self
    }

    #[cfg(feature = "fs")]
    pub fn write_to_fs(&self, destination: &Path) -> Result<usize, Error> {
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

    pub hook: Option<HookAnalysis>,
    pub is_entry: bool,

    #[serde(skip_serializing)]
    pub order: u64,
}

#[derive(Debug, Clone, Default)]
pub struct ErrorBuffer(std::sync::Arc<std::sync::Mutex<Vec<swc_common::errors::Diagnostic>>>);

impl Emitter for ErrorBuffer {
    fn emit(&mut self, db: &DiagnosticBuilder) {
        self.0.lock().unwrap().push((**db).clone());
    }
}

pub fn transform_code(config: TransformCodeOptions) -> Result<TransformOutput, anyhow::Error> {
    let source_map = Lrc::new(SourceMap::default());

    let path_data = parse_path(config.path)?;
    let module = parse(config.code, &path_data, Lrc::clone(&source_map));
    if config.print_ast {
        dbg!(&module);
    }
    let extension = if config.transpile {
        JsWord::from("js")
    } else {
        JsWord::from(path_data.extension.clone())
    };
    let transpile = config.transpile;
    let origin: JsWord = path_data.path.to_slash_lossy().into();

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
                    let unresolved_mark = Mark::new();
                    let top_level_mark = Mark::new();

                    let mut main_module = main_module;

                    // Transpile JSX
                    if transpile && is_type_script {
                        main_module = if is_jsx {
                            main_module.fold_with(&mut typescript::strip_with_jsx(
                                Lrc::clone(&source_map),
                                typescript::Config {
                                    pragma: Some("h".to_string()),
                                    pragma_frag: Some("Fragment".to_string()),
                                    ..Default::default()
                                },
                                Some(&comments),
                                top_level_mark,
                            ))
                        } else {
                            main_module.fold_with(&mut typescript::strip(top_level_mark))
                        }
                    }

                    // Transpile JSX
                    if transpile && is_jsx {
                        let mut react_options = react::Options::default();
                        if is_jsx {
                            react_options.throw_if_namespace = Some(false);
                            react_options.runtime = Some(react::Runtime::Automatic);
                            react_options.import_source = Some("@builder.io/qwik".to_string());
                        };
                        main_module = main_module.fold_with(&mut react::react(
                            Lrc::clone(&source_map),
                            Some(&comments),
                            react_options,
                            top_level_mark,
                        ));
                    }

                    // Resolve with mark
                    main_module.visit_mut_with(&mut resolver(
                        unresolved_mark,
                        top_level_mark,
                        is_type_script && !transpile,
                    ));

                    // Collect import/export metadata
                    let collect = global_collect(&main_module);
                    let mut qwik_transform = QwikTransform::new(QwikTransformOptions {
                        path_data: &path_data,
                        entry_policy: config.entry_policy,
                        explicity_extensions: config.explicity_extensions,
                        extension: extension.clone(),
                        comments: Some(&comments),
                        global_collect: collect,
                        scope: config.scope,
                        dev: config.dev,
                        is_inline: config.is_inline,
                    });

                    // Run main transform
                    main_module = main_module.fold_with(&mut qwik_transform);

                    if config.minify != MinifyMode::None {
                        main_module = main_module.fold_with(&mut simplify::simplifier(
                            unresolved_mark,
                            Default::default(),
                        ));
                    }
                    main_module.visit_mut_with(&mut hygiene_with_config(Default::default()));
                    main_module.visit_mut_with(&mut fixer(None));

                    let hooks = qwik_transform.hooks;
                    let mut modules: Vec<TransformModule> = Vec::with_capacity(hooks.len() + 10);

                    let comments_maps = comments.clone().take_all();
                    for h in hooks.into_iter() {
                        let is_entry = h.entry == None;
                        let hook_path = [&h.canonical_filename, ".", &h.data.extension].concat();

                        let (mut hook_module, comments) = new_module(NewModuleCtx {
                            expr: h.expr,
                            path: &path_data,
                            name: &h.name,
                            origin: &h.data.origin,
                            local_idents: &h.data.local_idents,
                            scoped_idents: &h.data.scoped_idents,
                            global: &qwik_transform.options.global_collect,
                            qwik_ident: &qwik_transform.qwik_ident,
                            is_entry,
                            leading_comments: comments_maps.0.clone(),
                            trailing_comments: comments_maps.1.clone(),
                        })?;
                        hook_module.visit_mut_with(&mut hygiene_with_config(Default::default()));
                        hook_module.visit_mut_with(&mut fixer(None));

                        let (code, map) = emit_source_code(
                            Lrc::clone(&source_map),
                            Some(comments),
                            &hook_module,
                            config.source_maps,
                        )
                        .unwrap();

                        modules.push(TransformModule {
                            code,
                            map,
                            is_entry,
                            path: hook_path,
                            order: h.hash,
                            hook: Some(HookAnalysis {
                                origin: h.data.origin,
                                name: h.name,
                                entry: h.entry,
                                extension: h.data.extension,
                                canonical_filename: h.canonical_filename,
                                parent: h.data.parent_hook,
                                ctx_kind: h.data.ctx_kind,
                                ctx_name: h.data.ctx_name,
                                captures: !h.data.scoped_idents.is_empty(),
                                display_name: h.data.display_name,
                                hash: h.data.hash,
                                loc: (h.span.lo.0, h.span.hi.0),
                            }),
                        });
                    }

                    let (code, map) = emit_source_code(
                        Lrc::clone(&source_map),
                        Some(comments),
                        &main_module,
                        config.source_maps,
                    )?;

                    let path = Path::new(&path_data.dir)
                        .join([&path_data.file_stem, ".", &extension].concat())
                        .to_slash_lossy();
                    let mut hasher = DefaultHasher::new();
                    hasher.write(path.as_bytes());

                    modules.push(TransformModule {
                        is_entry: false,
                        path,
                        code,
                        map,
                        order: hasher.finish(),
                        hook: None,
                    });

                    let diagnostics = handle_error(&error_buffer, origin, &source_map);
                    Ok(TransformOutput {
                        modules,
                        diagnostics,
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
            let diagnostics = handle_error(&error_buffer, origin, &source_map);
            Ok(TransformOutput {
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
    path_data: &PathData,
    source_map: Lrc<SourceMap>,
) -> PResult<(ast::Module, SingleThreadedComments, bool, bool)> {
    let source_file =
        source_map.new_source_file(FileName::Real(path_data.path.clone()), code.into());

    let comments = SingleThreadedComments::default();
    let (is_type_script, is_jsx) = parse_filename(path_data);
    let syntax = if is_type_script {
        Syntax::Typescript(TsConfig {
            tsx: is_jsx,
            ..Default::default()
        })
    } else {
        Syntax::Es(EsConfig {
            jsx: is_jsx,
            export_default_from: true,
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

fn parse_filename(path_data: &PathData) -> (bool, bool) {
    match path_data.extension.as_str() {
        "ts" => (true, false),
        "js" => (false, false),
        "jsx" => (false, true),
        _ => (true, true),
    }
}

pub fn emit_source_code(
    source_map: Lrc<SourceMap>,
    comments: Option<SingleThreadedComments>,
    program: &ast::Module,
    source_maps: bool,
) -> Result<(String, Option<Vec<u8>>), Error> {
    let mut src_map_buf = Vec::new();
    let mut buf = Vec::new();
    {
        let writer = Box::new(JsWriter::new(
            Lrc::clone(&source_map),
            "\n",
            &mut buf,
            if source_maps {
                Some(&mut src_map_buf)
            } else {
                None
            },
        ));
        let config = swc_ecmascript::codegen::Config { minify: false };
        let mut emitter = swc_ecmascript::codegen::Emitter {
            cfg: config,
            comments: Some(&comments),
            cm: Lrc::clone(&source_map),
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
        Ok((
            unsafe { str::from_utf8_unchecked(&buf).to_string() },
            Some(map_buf),
        ))
    } else {
        Ok((unsafe { str::from_utf8_unchecked(&buf).to_string() }, None))
    }
}

fn handle_error(
    error_buffer: &ErrorBuffer,
    origin: JsWord,
    source_map: &Lrc<SourceMap>,
) -> Vec<Diagnostic> {
    error_buffer
        .0
        .lock()
        .map(|diagnostics| diagnostics.clone())
        .ok()
        .unwrap_or_default()
        .iter()
        .map(|diagnostic| {
            let message = diagnostic.message();
            let span = diagnostic.span.clone();
            let suggestions = diagnostic.suggestions.clone();

            let span_labels = span.span_labels();
            let code_highlights = if span_labels.is_empty() {
                None
            } else {
                Some(
                    span_labels
                        .into_iter()
                        .map(|span_label| CodeHighlight {
                            message: span_label.label,
                            loc: SourceLocation::from(source_map, span_label.span),
                        })
                        .collect(),
                )
            };

            let hints = if suggestions.is_empty() {
                None
            } else {
                Some(
                    suggestions
                        .into_iter()
                        .map(|suggestion| suggestion.msg)
                        .collect(),
                )
            };

            Diagnostic {
                origin: origin.clone(),
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
    pub path: PathBuf,
    pub dir: String,
    pub file_stem: String,
    pub extension: String,
    pub file_name: String,
    pub file_prefix: String,
}

pub fn parse_path(src: &str) -> Result<PathData, Error> {
    let path = Path::new(src);
    let file_stem = path
        .file_stem()
        .and_then(OsStr::to_str)
        .map(Into::into)
        .with_context(|| format!("Computing file stem for {}", path.to_string_lossy()))?;

    let dir = path.parent().and_then(Path::to_str).unwrap_or("");
    let extension = path.extension().and_then(OsStr::to_str).unwrap_or("");
    let file_name = path
        .file_name()
        .and_then(OsStr::to_str)
        .with_context(|| format!("Computing filename for {}", path.to_string_lossy()))?;
    let file_prefix = file_name
        .rsplitn(2, '.')
        .last()
        .with_context(|| format!("Computing file_prefix for {}", path.to_string_lossy()))?;

    Ok(PathData {
        path: path.into(),
        dir: dir.into(),
        file_stem,
        extension: extension.into(),
        file_name: file_name.into(),
        file_prefix: file_prefix.into(),
    })
}
