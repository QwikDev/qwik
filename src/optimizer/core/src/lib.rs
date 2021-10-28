extern crate glob;
extern crate serde;
extern crate serde_bytes;
extern crate swc_atoms;
extern crate swc_common;
extern crate swc_ecmascript;

#[cfg(test)]
mod test;

mod transform;
mod utils;

use std::error;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::str;

use serde::{Deserialize, Serialize};
use swc_common::comments::SingleThreadedComments;
use swc_common::errors::{DiagnosticBuilder, Emitter, Handler};
use swc_common::{chain, sync::Lrc, FileName, Globals, SourceMap};
use swc_ecmascript::ast::Module;
use swc_ecmascript::codegen::text_writer::JsWriter;
use swc_ecmascript::parser::lexer::Lexer;
use swc_ecmascript::parser::{EsConfig, PResult, Parser, StringInput, Syntax, TsConfig};
use swc_ecmascript::transforms::{pass, typescript};
use swc_ecmascript::visit::FoldWith;
use utils::{CodeHighlight, Diagnostic, DiagnosticSeverity, SourceLocation};

#[derive(Serialize, Debug, Deserialize)]
pub struct FSConfig {
    project_root: String,
    source_maps: bool,
    minify: bool,
    transpile: bool,
}

#[derive(Serialize, Debug, Deserialize)]
pub struct Config {
    filename: String,
    source_maps: bool,
    minify: bool,
    transpile: bool,
    #[serde(with = "serde_bytes")]
    code: Vec<u8>,
}

#[derive(Serialize, Debug, Deserialize, Default)]
pub struct TransformResult {
    #[serde(with = "serde_bytes")]
    pub code: Option<Vec<u8>>,

    #[serde(with = "serde_bytes")]
    pub map: Option<Vec<u8>>,
    pub diagnostics: Option<Vec<Diagnostic>>,
}

#[derive(Serialize, Debug, Deserialize, Default)]
pub struct TransformStringResult {
    pub code: Option<String>,
    pub map: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ErrorBuffer(std::sync::Arc<std::sync::Mutex<Vec<swc_common::errors::Diagnostic>>>);

impl Emitter for ErrorBuffer {
    fn emit(&mut self, db: &DiagnosticBuilder) {
        self.0.lock().unwrap().push((**db).clone());
    }
}

impl TransformResult {
    pub fn to_string(&self) -> TransformStringResult {
        TransformStringResult {
            code: if let Some(code) = &self.code {
                Some(str::from_utf8(&code).unwrap().to_string())
            } else {
                None
            },
            map: if let Some(map) = &self.map {
                Some(str::from_utf8(&map).unwrap().to_string())
            } else {
                None
            },
        }
    }
}

pub fn transform_workdir(
    config: &FSConfig,
) -> Result<Vec<Result<TransformResult, Box<dyn error::Error>>>, Box<dyn error::Error>> {
    let srcdir = PathBuf::from(config.project_root.clone());
    let canonical = fs::canonicalize(&srcdir)?;
    let pattern = canonical.join("**/*.js");
    let paths = glob::glob(pattern.to_str().unwrap())?;
    let results = paths
        .map(|p| -> Result<TransformResult, Box<dyn error::Error>> {
            let value = p.unwrap();
            let pathstr = value.to_str().unwrap();
            let data = fs::read(&value).expect("Unable to read file");
            println!("{}", pathstr);
            transform(Config {
                filename: pathstr.to_string(),
                minify: config.minify,
                code: data,
                source_maps: config.source_maps,
                transpile: config.transpile,
            })
        })
        .collect();

    return Ok(results);
}

pub fn transform(config: Config) -> Result<TransformResult, Box<dyn error::Error>> {
    let code = unsafe { std::str::from_utf8_unchecked(&config.code) };
    let source_map = Lrc::new(SourceMap::default());
    let module = parse(code, config.filename.as_str(), &source_map, &config);

    // dbg!(&module);

    match module {
        Ok((module, comments)) => {
            swc_common::GLOBALS.set(&Globals::new(), || {
                let module = {
                    let mut passes = chain!(
                        transform::HookTransform::default(),
                        pass::Optional::new(typescript::strip(), config.transpile),
                    );
                    module.fold_with(&mut passes)
                };

                let (code, map) = emit_source_code(source_map, comments, &module, &config)?;
                Ok(TransformResult {
                    code: Some(code),
                    map: map,
                    diagnostics: None,
                })
            })
        }
        Err(err) => {
            let error_buffer = ErrorBuffer::default();
            let handler = Handler::with_emitter(true, false, Box::new(error_buffer.clone()));
            err.into_diagnostic(&handler).emit();
            let diagnostics = handle_error(error_buffer, &source_map);
            Ok(TransformResult {
                code: None,
                map: None,
                diagnostics: Some(diagnostics),
            })
        }
    }
}

fn parse(
    code: &str,
    filename: &str,
    source_map: &Lrc<SourceMap>,
    config: &Config,
) -> PResult<(Module, SingleThreadedComments)> {
    let source_file = source_map.new_source_file(FileName::Real(filename.into()), code.into());

    let comments = SingleThreadedComments::default();
    let (is_type_script, is_jsx) = parse_filename(&config.filename.as_str());
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
    comments: SingleThreadedComments,
    program: &Module,
    config: &Config,
) -> Result<(Vec<u8>, Option<Vec<u8>>), std::io::Error> {
    let mut src_map_buf = vec![];
    let mut buf = vec![];
    {
        let writer = Box::new(JsWriter::new(
            source_map.clone(),
            "\n",
            &mut buf,
            if config.source_maps {
                Some(&mut src_map_buf)
            } else {
                None
            },
        ));
        let config = swc_ecmascript::codegen::Config {
            minify: config.minify,
        };
        let mut emitter = swc_ecmascript::codegen::Emitter {
            cfg: config,
            comments: Some(&comments),
            cm: source_map.clone(),
            wr: writer,
        };

        emitter.emit_module(program)?;
    }

    let mut map_buf = vec![];
    if config.source_maps
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
