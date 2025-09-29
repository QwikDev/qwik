use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::ffi::OsStr;
use std::hash::Hasher;
use std::path::{Component, Path, PathBuf};
use std::str;

use crate::add_side_effect::SideEffectVisitor;
use crate::clean_side_effects::Treeshaker;
use crate::code_move::{new_module, NewModuleCtx};
use crate::collector::global_collect;
use crate::const_replace::ConstReplacerVisitor;
use crate::entry_strategy::EntryPolicy;
use crate::filter_exports::StripExportsVisitor;
use crate::props_destructuring::transform_props_destructuring;
use crate::rename_imports::RenameTransform;
use crate::transform::{QwikTransform, QwikTransformOptions, Segment, SegmentKind};
use crate::utils::{Diagnostic, DiagnosticCategory, DiagnosticScope, SourceLocation};
use crate::EntryStrategy;
use path_slash::PathExt;
use serde::{Deserialize, Serialize};

use anyhow::{Context, Error};

use swc_atoms::Atom;
use swc_common::comments::SingleThreadedComments;
use swc_common::errors::{DiagnosticBuilder, DiagnosticId, Emitter, Handler};
use swc_common::{sync::Lrc, FileName, Globals, Mark, SourceMap};
use swc_ecmascript::ast;
use swc_ecmascript::codegen::text_writer::JsWriter;
use swc_ecmascript::parser::lexer::Lexer;
use swc_ecmascript::parser::{EsSyntax, PResult, Parser, StringInput, Syntax, TsSyntax};
use swc_ecmascript::transforms::{
	fixer, hygiene::hygiene_with_config, optimization::simplify, react, resolver, typescript,
};
use swc_ecmascript::visit::{FoldWith, VisitMutWith};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SegmentAnalysis {
	pub origin: Atom,
	pub name: Atom,
	pub entry: Option<Atom>,
	pub display_name: Atom,
	pub hash: Atom,
	pub canonical_filename: Atom,
	pub path: Atom,
	pub extension: Atom,
	pub parent: Option<Atom>,
	pub ctx_kind: SegmentKind,
	pub ctx_name: Atom,
	pub captures: bool,
	pub loc: (u32, u32),
	#[serde(skip_serializing_if = "Option::is_none")]
	pub param_names: Option<Vec<Atom>>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub capture_names: Option<Vec<Atom>>,
}

#[derive(Debug, Serialize, Deserialize, Copy, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MinifyMode {
	Simplify,
	None,
}

#[derive(Debug, Serialize, Deserialize, Copy, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EmitMode {
	Prod,
	Lib,
	Dev,
	Test,
}

pub struct TransformCodeOptions<'a> {
	pub relative_path: &'a str,
	pub dev_path: Option<&'a str>,
	pub src_dir: &'a Path,
	pub root_dir: Option<&'a Path>,
	pub source_maps: bool,
	pub minify: MinifyMode,
	pub transpile_ts: bool,
	pub transpile_jsx: bool,
	pub preserve_filenames: bool,
	pub explicit_extensions: bool,
	pub code: &'a str,
	pub entry_policy: &'a dyn EntryPolicy,
	pub mode: EmitMode,
	pub scope: Option<&'a String>,
	pub entry_strategy: EntryStrategy,
	pub core_module: Atom,

	pub reg_ctx_name: Option<&'a [Atom]>,
	pub strip_exports: Option<&'a [Atom]>,
	pub strip_ctx_name: Option<&'a [Atom]>,
	pub strip_event_handlers: bool,
	pub is_server: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TransformOutput {
	pub modules: Vec<TransformModule>,
	pub diagnostics: Vec<Diagnostic>,
	pub is_type_script: bool,
	pub is_jsx: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QwikBundle {
	pub size: usize,
	pub symbols: Vec<Atom>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QwikManifest {
	pub version: Atom,
	pub symbols: HashMap<Atom, SegmentAnalysis>,
	pub bundles: HashMap<Atom, QwikBundle>,
	pub mapping: HashMap<Atom, Atom>,
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

	pub fn get_manifest(&self) -> QwikManifest {
		let mut manifest = QwikManifest {
			bundles: HashMap::new(),
			symbols: HashMap::new(),
			mapping: HashMap::new(),
			version: "1".into(),
		};
		for module in &self.modules {
			if let Some(segment) = &module.segment {
				let filename = Atom::from(format!(
					"{}.{}",
					segment.canonical_filename, segment.extension
				));
				manifest
					.mapping
					.insert(segment.name.clone(), filename.clone());
				manifest
					.symbols
					.insert(segment.name.clone(), segment.clone());
				manifest.bundles.insert(
					filename.clone(),
					QwikBundle {
						symbols: vec![segment.name.clone()],
						size: module.code.len(),
					},
				);
			}
		}
		manifest
	}
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TransformModule {
	pub path: String,
	pub code: String,

	pub map: Option<String>,

	pub segment: Option<SegmentAnalysis>,
	pub is_entry: bool,

	#[serde(skip_serializing)]
	pub order: u64,
}

#[derive(Debug, Clone, Default)]
pub struct ErrorBuffer(std::sync::Arc<std::sync::Mutex<Vec<swc_common::errors::Diagnostic>>>);

impl Emitter for ErrorBuffer {
	fn emit(&mut self, db: &mut DiagnosticBuilder) {
		self.0.lock().unwrap().push((**db).clone());
	}
}

pub fn transform_code(config: TransformCodeOptions) -> Result<TransformOutput, anyhow::Error> {
	let source_map = Lrc::new(SourceMap::default());
	let path_data = parse_path(
		config.relative_path.replace('\\', "/").as_str(),
		config.src_dir,
	)?;
	let result = parse(
		config.code,
		&path_data,
		config.root_dir,
		Lrc::clone(&source_map),
	);
	// dbg!(&module);
	let transpile_jsx = config.transpile_jsx;
	let transpile_ts = config.transpile_ts;

	let origin: Atom = Atom::from(path_data.rel_path.to_string_lossy());

	match result {
		Ok((program, comments, is_type_script, is_jsx)) => {
			let extension = match (transpile_ts, transpile_jsx, is_type_script, is_jsx) {
				(true, true, _, _) => Atom::from("js"),
				(true, false, _, true) => Atom::from("jsx"),
				(true, false, _, false) => Atom::from("js"),
				(false, true, true, _) => Atom::from("ts"),
				(false, true, false, _) => Atom::from("js"),
				(false, false, _, _) => Atom::from(path_data.extension.clone()),
			};
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

					let mut program = program;

					if let Some(strip_exports) = config.strip_exports {
						let mut visitor = StripExportsVisitor::new(strip_exports);
						program.visit_mut_with(&mut visitor);
					}

					let mut did_transform = false;

					if transpile_ts && is_type_script {
						did_transform = true;
						program.mutate(&mut typescript::strip(Default::default(), top_level_mark));
					}

					if transpile_jsx && is_jsx {
						did_transform = true;
						let mut react_options = react::Options::default();
						if is_jsx {
							react_options.next = Some(true);
							react_options.throw_if_namespace = Some(false);
							react_options.runtime = Some(react::Runtime::Automatic);
							react_options.import_source = Some("@qwik.dev/core".to_string().into());
						};
						program.mutate(&mut react::react(
							Lrc::clone(&source_map),
							Some(&comments),
							react_options,
							top_level_mark,
							unresolved_mark,
						));
					}

					// rename old imports to new imports
					program.visit_mut_with(&mut RenameTransform);

					// Resolve with mark
					program.visit_mut_with(&mut resolver(
						unresolved_mark,
						top_level_mark,
						is_type_script && !transpile_ts,
					));
					// Collect import/export metadata
					let mut collect = global_collect(&program);

					let mut qt: Option<QwikTransform<'_>> = None;
					let mut segments: Vec<Segment> = Vec::new();

					// Don't further process library code
					// It will be processed during client build
					// This way no internal API usage is published
					if config.mode != EmitMode::Lib {
						let is_dev = config.mode == EmitMode::Dev;

						// reconstruct destructured props for signal forwarding
						transform_props_destructuring(
							&mut program,
							&mut collect,
							&config.core_module,
						);

						// replace const values
						if config.mode != EmitMode::Test {
							let mut const_replacer =
								ConstReplacerVisitor::new(config.is_server, is_dev, &collect);
							program.visit_mut_with(&mut const_replacer);
						}

						// split into segments
						let mut qwik_transform = QwikTransform::new(QwikTransformOptions {
							path_data: &path_data,
							dev_path: config.dev_path,
							entry_policy: config.entry_policy,
							explicit_extensions: config.explicit_extensions,
							extension: extension.clone(),
							comments: Some(&comments),
							global_collect: collect,
							scope: config.scope,
							mode: config.mode,
							core_module: config.core_module,
							entry_strategy: config.entry_strategy,
							reg_ctx_name: config.reg_ctx_name,
							strip_ctx_name: config.strip_ctx_name,
							strip_event_handlers: config.strip_event_handlers,
							is_server: config.is_server,
							cm: Lrc::clone(&source_map),
						});

						// print before transform, for debugging
						// println!(
						// 	"{}",
						// 	emit_source_code(
						// 		Lrc::clone(&source_map.clone()),
						// 		None,
						// 		&main_module.clone(),
						// 		config.root_dir,
						// 		false,
						// 	)
						// 	.unwrap()
						// 	.0
						// );
						program = program.fold_with(&mut qwik_transform);

						let mut treeshaker = Treeshaker::new();
						if config.minify != MinifyMode::None {
							// remove all side effects from client, step 1
							if !config.is_server {
								program.visit_mut_with(&mut treeshaker.marker);
							}

							// simplify & strip unused code
							program.mutate(&mut simplify::simplifier(
								unresolved_mark,
								simplify::Config {
									dce: simplify::dce::Config {
										preserve_imports_with_side_effects: false,
										..Default::default()
									},
									..Default::default()
								},
							));
						}
						if matches!(
							config.entry_strategy,
							EntryStrategy::Inline | EntryStrategy::Hoist
						) {
							program.visit_mut_with(&mut SideEffectVisitor::new(
								&qwik_transform.options.global_collect,
								&path_data,
								config.src_dir,
							));
						} else if config.minify != MinifyMode::None && !config.is_server {
							// remove all side effects from client, step 2
							program.visit_mut_with(&mut treeshaker.cleaner);
							if treeshaker.cleaner.did_drop {
								program.mutate(&mut simplify::simplifier(
									unresolved_mark,
									simplify::Config {
										dce: simplify::dce::Config {
											preserve_imports_with_side_effects: false,
											..Default::default()
										},
										..Default::default()
									},
								));
							}
						}
						segments = qwik_transform.segments.clone();
						qt = Some(qwik_transform);
					}
					program.visit_mut_with(&mut hygiene_with_config(Default::default()));
					program.visit_mut_with(&mut fixer(None));

					let mut modules: Vec<TransformModule> = Vec::with_capacity(segments.len() + 10);

					let comments_maps = comments.clone().take_all();
					// Now process each segment
					if !segments.is_empty() {
						let q = qt.as_ref().unwrap();
						for h in segments.into_iter() {
							let is_entry = h.entry.is_none();
							let path_str = h.data.path.to_string();
							let path = if path_str.is_empty() {
								path_str
							} else {
								[&path_str, "/"].concat()
							};
							let segment_path = [
								path,
								[&h.canonical_filename, ".", &h.data.extension].concat(),
							]
							.concat();

							let (mut segment_module, comments) = new_module(NewModuleCtx {
								expr: h.expr,
								path: &path_data,
								name: &h.name,
								local_idents: &h.data.local_idents,
								scoped_idents: &h.data.scoped_idents,
								need_transform: h.data.need_transform,
								explicit_extensions: q.options.explicit_extensions,
								global: &q.options.global_collect,
								core_module: &q.options.core_module,
								leading_comments: comments_maps.0.clone(),
								trailing_comments: comments_maps.1.clone(),
								extra_top_items: &q.extra_top_items,
							})?;
							// we don't need to remove side effects because the optimizer only moves what's really used
							if config.minify != MinifyMode::None {
								let mut program = ast::Program::Module(segment_module);
								program.mutate(&mut simplify::simplifier(
									unresolved_mark,
									simplify::Config {
										dce: simplify::dce::Config {
											preserve_imports_with_side_effects: false,
											..Default::default()
										},
										..Default::default()
									},
								));
								segment_module = program.expect_module();
							}
							segment_module
								.visit_mut_with(&mut hygiene_with_config(Default::default()));
							segment_module.visit_mut_with(&mut fixer(None));

							let (code, map) = emit_source_code(
								Lrc::clone(&source_map),
								Some(comments),
								&segment_module,
								config.root_dir,
								config.source_maps,
							)
							.unwrap();

							modules.push(TransformModule {
								code,
								map,
								is_entry,
								path: segment_path,
								order: h.hash,
								segment: Some(SegmentAnalysis {
									origin: h.data.origin,
									name: h.name,
									entry: h.entry,
									extension: h.data.extension,
									canonical_filename: h.canonical_filename,
									path: h.data.path,
									parent: h.data.parent_segment,
									ctx_kind: h.data.ctx_kind,
									ctx_name: h.data.ctx_name,
									captures: !h.data.scoped_idents.is_empty(),
									display_name: h.data.display_name,
									hash: h.data.hash,
									loc: (h.span.lo.0, h.span.hi.0),
									param_names: h.param_names,
									capture_names: if h.data.scoped_idents.is_empty() {
										None
									} else {
										Some(
											h.data
												.scoped_idents
												.iter()
												.map(|id| id.0.clone())
												.collect(),
										)
									},
								}),
							});
						}
					}

					let (code, map) = match program {
						ast::Program::Module(ref modu) => emit_source_code(
							Lrc::clone(&source_map),
							Some(comments),
							modu,
							config.root_dir,
							config.source_maps,
						)?,
						_ => (String::new(), None),
					};

					let a = if did_transform && !config.preserve_filenames {
						[&path_data.file_stem, ".", &extension].concat()
					} else {
						path_data.file_name
					};
					let path = path_data.rel_dir.join(a).to_slash_lossy().to_string();

					let mut hasher = DefaultHasher::new();
					hasher.write(path.as_bytes());

					modules.push(TransformModule {
						is_entry: false,
						path,
						code,
						map,
						order: hasher.finish(),
						segment: None,
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
	root_dir: Option<&Path>,
	source_map: Lrc<SourceMap>,
) -> PResult<(ast::Program, SingleThreadedComments, bool, bool)> {
	let sm_path = if let Some(root_dir) = root_dir {
		pathdiff::diff_paths(path_data.abs_path.clone(), root_dir).unwrap()
	} else {
		path_data.abs_path.clone()
	};
	let source_file = source_map.new_source_file(FileName::Real(sm_path).into(), code.to_string());

	let comments = SingleThreadedComments::default();
	let (is_type_script, is_jsx) = parse_filename(path_data);
	let syntax = if is_type_script {
		Syntax::Typescript(TsSyntax {
			tsx: is_jsx,
			decorators: true,
			..Default::default()
		})
	} else {
		Syntax::Es(EsSyntax {
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
	match parser.parse_program() {
		Err(err) => Err(err),
		Ok(result) => Ok((result, comments, is_type_script, is_jsx)),
	}
}

fn parse_filename(path_data: &PathData) -> (bool, bool) {
	match path_data.extension.as_str() {
		"ts" => (true, false),
		"mts" => (true, false),
		"mtsx" => (true, true),
		"js" => (false, false),
		"mjs" => (false, false),
		"cjs" => (false, false),
		"jsx" => (false, true),
		"mjsx" => (false, true),
		"cjsx" => (false, true),
		_ => (true, true),
	}
}

pub fn emit_source_code(
	source_map: Lrc<SourceMap>,
	comments: Option<SingleThreadedComments>,
	module: &ast::Module,
	root_dir: Option<&Path>,
	source_maps: bool,
) -> Result<(String, Option<String>), Error> {
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
		let config = swc_ecmascript::codegen::Config::default();
		let mut emitter = swc_ecmascript::codegen::Emitter {
			cfg: config,
			comments: Some(&comments),
			cm: Lrc::clone(&source_map),
			wr: writer,
		};
		emitter.emit_module(module)?;
	}

	let mut map_buf = vec![];
	let emit_source_maps = if source_maps {
		let mut s = source_map.build_source_map(
			&src_map_buf,
			None,
			swc_common::source_map::DefaultSourceMapGenConfig,
		);
		if let Some(root_dir) = root_dir {
			s.set_source_root(Some(root_dir.to_string_lossy().to_string()));
		}
		s.to_writer(&mut map_buf).is_ok()
	} else {
		false
	};
	if emit_source_maps {
		Ok((
			unsafe { str::from_utf8_unchecked(&buf).to_string() },
			unsafe { Some(str::from_utf8_unchecked(&map_buf).to_string()) },
		))
	} else {
		Ok((unsafe { str::from_utf8_unchecked(&buf).to_string() }, None))
	}
}

fn handle_error(
	error_buffer: &ErrorBuffer,
	origin: Atom,
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
			let code = diagnostic.get_code().and_then(|m| {
				if let DiagnosticId::Error(s) = m {
					Some(s)
				} else {
					None
				}
			});

			let span = diagnostic.span.clone();
			let suggestions = diagnostic.suggestions.clone();

			let span_labels = span.span_labels();
			let highlights = if span_labels.is_empty() {
				None
			} else {
				Some(
					span_labels
						.into_iter()
						.flat_map(|span_label| {
							if span_label.span.hi == span_label.span.lo {
								None
							} else {
								Some(SourceLocation::from(source_map, span_label.span))
							}
						})
						.collect(),
				)
			};

			let suggestions = if suggestions.is_empty() {
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
				file: origin.clone(),
				code,
				message,
				highlights,
				suggestions,
				category: DiagnosticCategory::Error,
				scope: DiagnosticScope::Optimizer,
			}
		})
		.collect()
}

pub struct PathData {
	pub abs_path: PathBuf,
	pub rel_path: PathBuf,
	pub abs_dir: PathBuf,
	pub rel_dir: PathBuf,
	pub file_stem: String,
	pub extension: String,
	pub file_name: String,
}

pub fn parse_path(src: &str, base_dir: &Path) -> Result<PathData, Error> {
	let path = Path::new(src);
	let lossy = path.to_slash_lossy();
	let path = Path::new(lossy.as_ref());
	let file_stem = path
		.file_stem()
		.and_then(OsStr::to_str)
		.map(Into::into)
		.with_context(|| format!("Computing file stem for {}", path.to_string_lossy()))?;

	let rel_dir = path.parent().unwrap().to_path_buf();
	let extension = path.extension().and_then(OsStr::to_str).unwrap();
	let file_name = path
		.file_name()
		.and_then(OsStr::to_str)
		.with_context(|| format!("Computing filename for {}", path.to_string_lossy()))?;

	let abs_path = normalize_path(base_dir.join(path));
	let abs_dir = normalize_path(abs_path.parent().unwrap());

	Ok(PathData {
		abs_path,
		rel_path: path.into(),
		abs_dir,
		rel_dir,
		extension: extension.into(),
		file_name: file_name.into(),
		file_stem,
	})
}

pub fn normalize_path<P: AsRef<Path>>(path: P) -> PathBuf {
	let ends_with_slash = path.as_ref().to_str().is_some_and(|s| s.ends_with('/'));
	let mut normalized = PathBuf::new();
	for component in path.as_ref().components() {
		match &component {
			Component::ParentDir => {
				if !normalized.pop() {
					normalized.push(component);
				}
			}
			_ => {
				normalized.push(component);
			}
		}
	}
	if ends_with_slash {
		normalized.push("");
	}
	normalized
}
