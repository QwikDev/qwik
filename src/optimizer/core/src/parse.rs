use std::error;
use std::ffi::OsStr;
use std::path::Path;
use std::str;

use crate::code_move::new_module;
use crate::collector::GlobalCollect;
use crate::transform::{Hook, HookTransform, TransformContext};
use crate::utils::{CodeHighlight, Diagnostic, DiagnosticSeverity, SourceLocation};
use serde::{Deserialize, Serialize};
use simple_error::*;
use std::fs;
use swc_common::comments::SingleThreadedComments;
use swc_common::errors::{DiagnosticBuilder, Emitter, Handler};
use swc_common::{chain, sync::Lrc, FileName, Globals, SourceMap, DUMMY_SP};
use swc_ecmascript::ast::*;
use swc_ecmascript::codegen::text_writer::JsWriter;
use swc_ecmascript::parser::lexer::Lexer;
use swc_ecmascript::parser::{EsConfig, PResult, Parser, StringInput, Syntax, TsConfig};
use swc_ecmascript::transforms::{pass, typescript};
use swc_ecmascript::visit::{FoldWith, VisitWith};

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct HookAnalysis {
    path: String,
    name: String,
    local_decl: Vec<String>,
    local_idents: Vec<String>,
}

pub struct InternalConfig<'a> {
    pub project_root: Option<String>,
    pub path: String,
    pub source_maps: bool,
    pub minify: bool,
    pub transpile: bool,
    pub print_ast: bool,
    pub code: &'a [u8],
    pub context: &'a mut TransformContext,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct TransformResult {
    pub project_root: Option<String>,
    pub modules: Vec<TransformModule>,
    pub diagnostics: Vec<Diagnostic>,
    pub hooks: Vec<HookAnalysis>,
}

impl TransformResult {
    pub fn write_to_fs(&self, destination: &str) -> Result<usize, Box<dyn std::error::Error>> {
        match self.project_root {
            None => {
                bail!("project_root needs to be defined");
            }
            Some(ref project_root) => {
                let destination = Path::new(destination);
                for module in &self.modules {
                    let origin = Path::new(&module.path).strip_prefix(project_root)?;
                    let write_path = destination.join(origin);
                    fs::write(write_path, &module.code)?;
                }
                return Ok(self.modules.len());
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct TransformModule {
    pub path: String,

    #[serde(with = "serde_bytes")]
    pub code: Vec<u8>,

    #[serde(with = "serde_bytes")]
    pub map: Option<Vec<u8>>,
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
        self.0.lock().unwrap().push((**db).clone());
    }
}

impl TransformModule {
    pub fn to_string(&self) -> TransformStringResult {
        TransformStringResult {
            path: self.path.clone(),
            code: str::from_utf8(&self.code).unwrap().to_string(),
            map: if let Some(map) = &self.map {
                Some(str::from_utf8(&map).unwrap().to_string())
            } else {
                None
            },
        }
    }
}

pub fn transform_internal(
    config: InternalConfig,
) -> Result<TransformResult, Box<dyn error::Error>> {
    let code = unsafe { std::str::from_utf8_unchecked(&config.code) };
    let module = parse(code, config.path.as_str(), &config);
    if config.print_ast {
        dbg!(&module);
    }

    match module {
        Ok((main_module, comments)) => swc_common::GLOBALS.set(&Globals::new(), || {
            let path = Path::new(&config.path);
            let dir = path.parent().unwrap();

            let file_stem = path.file_stem().unwrap().to_str().unwrap().to_string();

            let mut collect = GlobalCollect::new(config.context.source_map.clone());
            main_module.visit_with(&Invalid { span: DUMMY_SP } as _, &mut collect);

            let mut hooks: Vec<Hook> = vec![];
            let main_module = {
                let mut passes = chain!(
                    pass::Optional::new(typescript::strip(), true),
                    HookTransform::new(config.context, file_stem.clone(), &mut hooks),
                );
                main_module.fold_with(&mut passes)
            };

            let mut output_modules: Vec<TransformModule> = hooks
                .iter()
                .map(|h| {
                    let hook_module = new_module(&file_stem, &h, &collect);
                    let (code, map) = emit_source_code(
                        config.context.source_map.clone(),
                        None,
                        &hook_module,
                        config.minify,
                        config.source_maps,
                    )
                    .unwrap();
                    TransformModule {
                        code: code,
                        map: map,
                        path: dir.join(&h.filename).to_str().unwrap().to_string(),
                    }
                })
                .collect();

            let hooks: Vec<HookAnalysis> = hooks
                .iter()
                .map(|h| HookAnalysis {
                    path: dir.join(&h.filename).to_str().unwrap().to_string(),
                    name: h.name.clone(),
                    local_decl: h.local_decl.iter().map(|d| d.to_string()).collect(),
                    local_idents: h.local_idents.iter().map(|d| d.to_string()).collect(),
                })
                .collect();

            let (code, map) = emit_source_code(
                config.context.source_map.clone(),
                Some(comments),
                &main_module,
                config.minify,
                config.source_maps,
            )?;
            output_modules.insert(
                0,
                TransformModule {
                    path: dir
                        .join(format!("{}.js", &file_stem))
                        .to_str()
                        .unwrap()
                        .to_string(),
                    code: code,
                    map: map,
                },
            );

            Ok(TransformResult {
                project_root: config.project_root,
                modules: output_modules,
                diagnostics: vec![],
                hooks: hooks,
            })
        }),
        Err(err) => {
            let error_buffer = ErrorBuffer::default();
            let handler = Handler::with_emitter(true, false, Box::new(error_buffer.clone()));
            err.into_diagnostic(&handler).emit();
            let diagnostics = handle_error(error_buffer, &config.context.source_map);
            Ok(TransformResult {
                project_root: config.project_root,
                hooks: vec![],
                modules: vec![],
                diagnostics: diagnostics,
            })
        }
    }
}

fn parse(
    code: &str,
    filename: &str,
    config: &InternalConfig,
) -> PResult<(Module, SingleThreadedComments)> {
    let source_map = &config.context.source_map;
    let source_file = source_map.new_source_file(FileName::Real(filename.into()), code.into());

    let comments = SingleThreadedComments::default();
    let (is_type_script, is_jsx) = parse_filename(&config.path.as_str());
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
        Ok(module) => Ok((module, comments)),
    }
}

fn parse_filename(filename: &str) -> (bool, bool) {
    let extension = Path::new(filename).extension().and_then(OsStr::to_str);
    match extension {
        Some("ts") => (true, false),
        Some("tsx") => (true, true),
        Some("js") => (false, false),
        Some("jsx") => (false, true),
        _ => (true, true),
    }
}

fn emit_source_code(
    source_map: Lrc<SourceMap>,
    comments: Option<SingleThreadedComments>,
    program: &Module,
    minify: bool,
    source_maps: bool,
) -> Result<(Vec<u8>, Option<Vec<u8>>), std::io::Error> {
    let mut src_map_buf = vec![];
    let mut buf = vec![];
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
        let config = swc_ecmascript::codegen::Config { minify: minify };
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
        Ok((buf, Some(map_buf)))
    } else {
        Ok((buf, None))
    }
}

fn handle_error(error_buffer: ErrorBuffer, source_map: &Lrc<SourceMap>) -> Vec<Diagnostic> {
    let s = error_buffer.0.lock().unwrap().clone();
    let diagnostics: Vec<Diagnostic> = s
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
                        loc: SourceLocation::from(&source_map, span_label.span),
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
        .collect();

    return diagnostics;
}
