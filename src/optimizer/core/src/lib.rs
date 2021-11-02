extern crate glob;
extern crate serde;
extern crate serde_bytes;
extern crate swc_atoms;
extern crate swc_common;
extern crate swc_ecmascript;

#[cfg(test)]
mod test;

mod collector;
mod transform;
mod utils;

use std::error;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::str;

use serde::{Deserialize, Serialize};
use swc_atoms::JsWord;
use swc_common::comments::SingleThreadedComments;
use swc_common::errors::{DiagnosticBuilder, Emitter, Handler};
use swc_common::{chain, sync::Lrc, FileName, Globals, SourceMap, DUMMY_SP};
use swc_ecmascript::ast::*;
use swc_ecmascript::codegen::text_writer::JsWriter;
use swc_ecmascript::parser::lexer::Lexer;
use swc_ecmascript::parser::{EsConfig, PResult, Parser, StringInput, Syntax, TsConfig};
use swc_ecmascript::transforms::{pass, typescript};
use swc_ecmascript::visit::{FoldWith, VisitWith};
use collector::{GlobalCollect, ImportKind};
pub use transform::{Hook, TransformContext};
use utils::{CodeHighlight, Diagnostic, DiagnosticSeverity, SourceLocation};

#[derive(Serialize, Debug, Deserialize)]
pub struct FSConfig {
    project_root: String,
    source_maps: bool,
    minify: bool,
    transpile: bool,
}

pub struct Config<'a> {
    pub filename: String,
    pub source_maps: bool,
    pub minify: bool,
    pub transpile: bool,
    pub print_ast: bool,
    pub code: Vec<u8>,
    pub context: &'a mut TransformContext,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct HookAnalysis {
    name: String,
    local_decl: Vec<String>,
    local_idents: Vec<String>,
}

#[derive(Serialize, Debug, Deserialize, Default)]
pub struct TransformResult {
    pub modules: Vec<TransformModule>,
    pub diagnostics: Option<Vec<Diagnostic>>,
    pub hooks: Option<Vec<HookAnalysis>>,
}

#[derive(Serialize, Debug, Deserialize, Default)]
pub struct TransformModule {
    pub filename: String,

    #[serde(with = "serde_bytes")]
    pub code: Vec<u8>,

    #[serde(with = "serde_bytes")]
    pub map: Option<Vec<u8>>,
}

#[derive(Serialize, Debug, Deserialize, Default)]
pub struct TransformStringResult {
    pub filename: String,
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
            filename: self.filename.clone(),
            code: str::from_utf8(&self.code).unwrap().to_string(),
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
    let srcdir = std::env::current_dir()?.join("src/fixtures");
    let srcdir = srcdir.join(PathBuf::from(config.project_root.clone()));
    let srcdir = srcdir.join("**/*.qwik.*");
    println!("{:?}", srcdir.to_str().unwrap());

    let mut context = TransformContext::new();
    let paths = glob::glob(srcdir.to_str().unwrap())?;
    let results = paths
        .map(|p| -> Result<TransformResult, Box<dyn error::Error>> {
            let value = p.unwrap();
            let pathstr = value.to_str().unwrap();
            let data = fs::read(&value).expect("Unable to read file");
            transform(Config {
                filename: pathstr.to_string(),
                minify: config.minify,
                code: data,
                source_maps: config.source_maps,
                transpile: config.transpile,
                print_ast: false,
                context: &mut context,
            })
        })
        .collect();

    return Ok(results);
}

pub fn transform(config: Config) -> Result<TransformResult, Box<dyn error::Error>> {
    let code = unsafe { std::str::from_utf8_unchecked(&config.code) };
    let module = parse(code, config.filename.as_str(), &config);
    if config.print_ast {
        dbg!(&module);
    }

    match module {
        Ok((main_module, comments)) => swc_common::GLOBALS.set(&Globals::new(), || {
            let file_stem = Path::new(&config.filename)
                .file_stem()
                .unwrap()
                .to_str()
                .unwrap();
            let mut collect = GlobalCollect::new(config.context.source_map.clone());
            main_module.visit_with(&Invalid { span: DUMMY_SP } as _, &mut collect);

            let mut hooks: Vec<Hook> = vec![];
            let main_module = {
                let mut passes = chain!(
                    pass::Optional::new(typescript::strip(), true),
                    transform::HookTransform::new(config.context, file_stem.clone(), &mut hooks),
                );
                main_module.fold_with(&mut passes)
            };

            let js_word_file_stem = JsWord::from(file_stem);
            let mut output_modules: Vec<TransformModule> = hooks
                .iter()
                .map(|h| {
                    let hook_module = new_module(&js_word_file_stem, &h, &collect);
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
                        filename: h.filename.clone(),
                    }
                })
                .collect();

            let hooks: Vec<HookAnalysis> = hooks
                .iter()
                .map(|h| HookAnalysis {
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
                    filename: format!("{}.js", file_stem),
                    code: code,
                    map: map,
                },
            );

            Ok(TransformResult {
                modules: output_modules,
                diagnostics: None,
                hooks: Some(hooks),
            })
        }),
        Err(err) => {
            let error_buffer = ErrorBuffer::default();
            let handler = Handler::with_emitter(true, false, Box::new(error_buffer.clone()));
            err.into_diagnostic(&handler).emit();
            let diagnostics = handle_error(error_buffer, &config.context.source_map);
            Ok(TransformResult {
                hooks: None,
                modules: vec![],
                diagnostics: Some(diagnostics),
            })
        }
    }
}

fn parse(code: &str, filename: &str, config: &Config) -> PResult<(Module, SingleThreadedComments)> {
    let source_map = &config.context.source_map;
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

fn new_module(file_stem: &JsWord, hook: &Hook, global: &GlobalCollect) -> Module {
    let mut module = Module {
        span: DUMMY_SP,
        body: vec![],
        shebang: None,
    };
    for ident in &hook.local_idents {
        if let Some(import) = global.imports.get(&ident) {
            let specifier =match import.kind {
                ImportKind::ImportNamed => {
                    ImportSpecifier::Named(ImportNamedSpecifier {
                        is_type_only: false,
                        span: DUMMY_SP,
                        imported: if &import.specifier != ident { Some(Ident::new(import.specifier.clone(), DUMMY_SP)) } else { None },
                        local: Ident::new(ident.clone(), DUMMY_SP),
                    })
                },
                ImportKind::ImportDefault => {
                    ImportSpecifier::Default(ImportDefaultSpecifier {
                        span: DUMMY_SP,
                        local: Ident::new(ident.clone(), DUMMY_SP),
                    })
                }
                ImportKind::ImportAll => {
                    ImportSpecifier::Namespace(ImportStarAsSpecifier {
                        span: DUMMY_SP,
                        local: Ident::new(ident.clone(), DUMMY_SP),
                    })
                }
            };
            module
                .body
                .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                    span: DUMMY_SP,
                    type_only: false,
                    asserts: None,
                    src: Str {
                        span: DUMMY_SP,
                        value: import.source.clone(),
                        kind: StrKind::Synthesized,
                        has_escape: false,
                    },
                    specifiers: vec![specifier],
                })))
        } else if let Some(export) = global.exports.get(&ident) {
            module
                .body
                .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                    span: DUMMY_SP,
                    type_only: false,
                    asserts: None,
                    src: Str {
                        span: DUMMY_SP,
                        value: JsWord::from(format!("./{}", file_stem)),
                        kind: StrKind::Synthesized,
                        has_escape: false,
                    },
                    specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                        is_type_only: false,
                        span: DUMMY_SP,
                        imported: None,
                        local: Ident::new(export.clone(), DUMMY_SP),
                    })],
                })))
        }
    }
    module.body.push(create_named_export(hook));

    return module;
}

fn create_named_export(hook: &Hook) -> ModuleItem {
    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
        span: DUMMY_SP,
        decl: Decl::Var(VarDecl {
            span: DUMMY_SP,
            kind: VarDeclKind::Const,
            declare: false,
            decls: vec![VarDeclarator {
                span: DUMMY_SP,
                definite: false,
                name: Pat::Ident(BindingIdent::from(Ident::new(
                    hook.name.clone().into(),
                    DUMMY_SP,
                ))),
                init: Some(hook.expr.clone()),
            }],
        }),
    }))
}
