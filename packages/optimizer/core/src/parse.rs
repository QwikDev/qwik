use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::ffi::OsStr;
use std::hash::Hasher;
use std::path::{Component, Path, PathBuf};
use std::str;

use crate::add_side_effect::SideEffectVisitor;
use crate::clean_side_effects::Treeshaker;
use crate::code_move::{new_module, NewModuleCtx};
use crate::collector::{collect_from_pat, global_collect, Id, Import, ImportKind};
use crate::const_replace::ConstReplacerVisitor;
use crate::dependency_analysis::{
	analyze_root_dependencies, build_root_var_usage_map, find_migratable_vars, RootVarDecl,
	RootVarDependency,
};
use crate::entry_strategy::EntryPolicy;
use crate::filter_exports::StripExportsVisitor;
use crate::props_destructuring::transform_props_destructuring;
use crate::rename_imports::RenameTransform;
use crate::transform::{
	create_synthetic_named_export, QwikTransform, QwikTransformOptions, Segment, SegmentKind,
};
use crate::utils::{Diagnostic, DiagnosticCategory, DiagnosticScope, SourceLocation};
use crate::words::{_INLINED_QRL_DEV, _NOOP_QRL_DEV, _QRL_DEV};
use crate::EntryStrategy;
use indexmap::IndexMap;
use path_slash::PathExt;
use serde::{Deserialize, Serialize};
use swc_common::{Span, DUMMY_SP};

use anyhow::{Context, Error};

use swc_atoms::Atom;
use swc_common::comments::{Comment, CommentKind, Comments, SingleThreadedComments};
use swc_common::errors::{DiagnosticBuilder, DiagnosticId, Emitter, Handler};
use swc_common::{sync::Lrc, FileName, Globals, Mark, SourceMap};
use swc_ecmascript::ast;
use swc_ecmascript::codegen::text_writer::JsWriter;
use swc_ecmascript::parser::lexer::Lexer;
use swc_ecmascript::parser::{EsSyntax, PResult, Parser, StringInput, Syntax, TsSyntax};
use swc_ecmascript::transforms::{
	fixer, hygiene::hygiene_with_config, optimization::simplify, react, resolver, typescript,
};
use swc_ecmascript::visit::{FoldWith, VisitMutWith, VisitWith};

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
	Hmr,
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

					{
						let is_dev = matches!(config.mode, EmitMode::Dev | EmitMode::Hmr);

						// Reconstruct destructured props for signal forwarding.
						// Runs for all modes including Lib, so library .qwik.mjs output
						// already has the transformation applied. For pre-compiled library
						// code (inlinedQrl calls), the transform skips their function bodies.
						transform_props_destructuring(
							&mut program,
							&mut collect,
							&config.core_module,
						);

						// Don't further process library code beyond QRL wrapping
						if config.mode != EmitMode::Lib {
							// replace const values
							if config.mode != EmitMode::Test {
								let mut const_replacer =
									ConstReplacerVisitor::new(config.is_server, is_dev, &collect);
								program.visit_mut_with(&mut const_replacer);
							}
						}

						// split into segments (also handles lib mode mechanical QRL wrapping)
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

						// Skip post-processing for library mode
						if config.mode != EmitMode::Lib {
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

							// Apply variable migration: move segment-exclusive root variables to their segments
							if !segments.is_empty() {
								let q = qt.as_mut().unwrap();
								if let ast::Program::Module(ref mut module) = &mut program {
									let migrated_ids = apply_variable_migration(
										&mut segments,
										module,
										&mut q.options.global_collect,
									);

									// Remove migrated variables from root module exports
									if !migrated_ids.is_empty() {
										for id in &migrated_ids {
											q.options
												.global_collect
												.remove_root_and_exports_for_id(id);
										}
										remove_migrated_exports(module, &migrated_ids);
										remove_unused_qrl_declarations(module);

										// Re-run DCE to remove imports that are no longer used
										// after migrating variables to segments
										if config.minify != MinifyMode::None {
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
								}
							}
						}
					}
					program.visit_mut_with(&mut hygiene_with_config(Default::default()));
					program.visit_mut_with(&mut fixer(None));
					let transform_diagnostics = qt
						.as_ref()
						.map(|q| q.diagnostics.clone())
						.unwrap_or_default();

					let mut modules: Vec<TransformModule> = Vec::with_capacity(segments.len() + 10);

					let comments_maps = comments.clone().take_all();
					// Now process each segment
					// TODO handle noop segments, don't generate code for them
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

							// Create explicit imports for dev-mode QRL helpers
							let mut explicit_imports = IndexMap::new();
							if matches!(config.mode, EmitMode::Dev | EmitMode::Hmr) {
								use swc_common::SyntaxContext;
								let dev_import = Import {
									source: q.options.core_module.clone(),
									specifier: (*_QRL_DEV).clone(),
									kind: ImportKind::Named,
									synthetic: true,
									asserts: None,
								};
								explicit_imports.insert(
									((*_QRL_DEV).clone(), SyntaxContext::empty()),
									dev_import.clone(),
								);

								let inlined_dev_import = Import {
									source: q.options.core_module.clone(),
									specifier: (*_INLINED_QRL_DEV).clone(),
									kind: ImportKind::Named,
									synthetic: true,
									asserts: None,
								};
								explicit_imports.insert(
									((*_INLINED_QRL_DEV).clone(), SyntaxContext::empty()),
									inlined_dev_import,
								);

								let noop_dev_import = Import {
									source: q.options.core_module.clone(),
									specifier: (*_NOOP_QRL_DEV).clone(),
									kind: ImportKind::Named,
									synthetic: true,
									asserts: None,
								};
								explicit_imports.insert(
									((*_NOOP_QRL_DEV).clone(), SyntaxContext::empty()),
									noop_dev_import,
								);
							}

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
								migrated_root_vars: &h.data.migrated_root_vars,
								explicit_imports: &explicit_imports,
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
							add_section_separators(&mut segment_module, &comments);

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
						ast::Program::Module(ref mut modu) => {
							add_section_separators(modu, &comments);
							emit_source_code(
								Lrc::clone(&source_map),
								Some(comments),
								modu,
								config.root_dir,
								config.source_maps,
							)?
						}
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

					let mut diagnostics = handle_error(&error_buffer, origin, &source_map);
					diagnostics.extend(transform_diagnostics);
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

/// Add `//` separator comments between import declarations, QRL const declarations,
/// and other module-level statements for readability. Uses `Span::dummy_with_cmt()`
/// so the extra lines don't affect source maps.
fn add_section_separators(module: &mut ast::Module, comments: &SingleThreadedComments) {
	#[derive(PartialEq)]
	enum Section {
		Import,
		QrlDecl,
		RefAssignment,
		Other,
	}

	fn classify(item: &ast::ModuleItem) -> Section {
		match item {
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(_)) => Section::Import,
			ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(var))) => {
				if let Some(decl) = var.decls.first() {
					if let ast::Pat::Ident(ident) = &decl.name {
						let name = &*ident.id.sym;
						if name.starts_with("q_") || name.starts_with("i_") {
							return Section::QrlDecl;
						}
					}
				}
				Section::Other
			}
			// Detect $ref$ assignments: q_name.$lazy$.$ref$ = ...
			ast::ModuleItem::Stmt(ast::Stmt::Expr(expr_stmt)) => {
				if let ast::Expr::Assign(assign) = &*expr_stmt.expr {
					if let ast::AssignTarget::Simple(ast::SimpleAssignTarget::Member(member)) =
						&assign.left
					{
						if let ast::MemberProp::Ident(prop) = &member.prop {
							if &*prop.sym == "$ref$" {
								return Section::RefAssignment;
							}
						}
					}
				}
				Section::Other
			}
			_ => Section::Other,
		}
	}

	/// Ensure the item's span.lo is non-dummy so comments can be emitted on it.
	fn ensure_comment_pos(item: &mut ast::ModuleItem) -> swc_common::BytePos {
		use swc_common::Spanned;
		let lo = item.span().lo;
		if !lo.is_dummy() {
			return lo;
		}
		let cmt_lo = Span::dummy_with_cmt().lo;
		match item {
			ast::ModuleItem::ModuleDecl(decl) => match decl {
				ast::ModuleDecl::Import(d) => d.span.lo = cmt_lo,
				ast::ModuleDecl::ExportDecl(d) => d.span.lo = cmt_lo,
				ast::ModuleDecl::ExportDefaultDecl(d) => d.span.lo = cmt_lo,
				ast::ModuleDecl::ExportDefaultExpr(d) => d.span.lo = cmt_lo,
				ast::ModuleDecl::ExportAll(d) => d.span.lo = cmt_lo,
				ast::ModuleDecl::ExportNamed(d) => d.span.lo = cmt_lo,
				_ => return lo, // can't handle TS-specific decls, skip
			},
			ast::ModuleItem::Stmt(stmt) => match stmt {
				ast::Stmt::Decl(ast::Decl::Var(v)) => v.span.lo = cmt_lo,
				ast::Stmt::Decl(ast::Decl::Fn(f)) => f.function.span.lo = cmt_lo,
				ast::Stmt::Expr(e) => e.span.lo = cmt_lo,
				_ => return lo,
			},
		}
		cmt_lo
	}

	let mut prev_section: Option<Section> = None;
	for item in &mut module.body {
		let section = classify(item);
		if let Some(ref prev) = prev_section {
			if prev != &section && section != Section::Import {
				let lo = ensure_comment_pos(item);
				if !lo.is_dummy() {
					comments.add_leading(
						lo,
						Comment {
							kind: CommentKind::Line,
							text: Atom::from(""),
							span: DUMMY_SP,
						},
					);
				}
			}
		}
		prev_section = Some(section);
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

/// Analyzes root variables and migrates segment-exclusive ones into their respective segments.
/// This reduces the parent module footprint and improves code chunking.
/// Returns the set of Id's that were migrated, so they can be removed from root exports.
fn apply_variable_migration(
	segments: &mut [Segment],
	module: &mut ast::Module,
	global_collect: &mut crate::collector::GlobalCollect,
) -> std::collections::HashSet<Id> {
	// Analyze root variable dependencies
	let root_dependencies = analyze_root_dependencies(module, global_collect);

	// Build usage map: which segments use which root variables
	let root_var_usage = build_root_var_usage_map(segments, &root_dependencies);

	// Find migratable variables: those used by exactly one segment and not exported
	// This returns a BTreeMap for deterministic iteration order
	let migratable = find_migratable_vars(segments, &root_dependencies, &root_var_usage);

	// PHASE 1: Pre-declare all needed auto-exports BEFORE migration
	// This ensures all dependencies are known upfront, preventing surprises during migration
	precompute_and_declare_auto_exports(module, global_collect, &migratable, &root_dependencies);

	let mut migrated_ids = std::collections::HashSet::new();

	// For each segment with migratable variables, extract and populate their declarations
	for (seg_idx, var_ids) in migratable {
		if seg_idx >= segments.len() {
			continue;
		}

		// Sort variables topologically within the migration set so dependencies are declared first.
		// Use source order as deterministic tie-breaker.
		let sorted_var_ids = sort_migrated_vars_topologically(&var_ids, &root_dependencies);
		let cyclic_var_ids = find_cyclic_migrated_vars(&sorted_var_ids, &root_dependencies);

		// Deduplicate declarations - multiple IDs can point to the same destructuring assignment
		let mut seen_var_decls = std::collections::HashSet::new();
		let mut unique_module_items = Vec::new();

		for var_id in &sorted_var_ids {
			if let Some(dep_info) = root_dependencies.get(var_id) {
				// Compare by content, not pointer - create a hash of the declaration
				let decl_key = match &dep_info.decl {
					RootVarDecl::Var(decl) => format!("var:{:?}|{:?}", decl.name, decl.init),
					RootVarDecl::Fn(decl) => format!("fn:{:?}", decl.ident),
					RootVarDecl::Class(decl) => format!("class:{:?}", decl.ident),
					RootVarDecl::TsEnum(decl) => format!("enum:{:?}", decl.id),
				};

				// Only add this var_decl if we haven't seen it before
				if seen_var_decls.insert(decl_key) {
					match &dep_info.decl {
						RootVarDecl::Var(decl) if cyclic_var_ids.contains(var_id) => {
							if let Some(items) = create_cyclic_var_items(decl) {
								unique_module_items.extend(items);
							} else {
								let var_decl = ast::VarDecl {
									span: swc_common::DUMMY_SP,
									kind: ast::VarDeclKind::Const,
									decls: vec![decl.clone()],
									declare: false,
									ctxt: swc_common::SyntaxContext::empty(),
								};
								unique_module_items.push(ast::ModuleItem::Stmt(ast::Stmt::Decl(
									ast::Decl::Var(Box::new(var_decl)),
								)));
							}
						}
						RootVarDecl::Var(decl) => {
							let var_decl = ast::VarDecl {
								span: swc_common::DUMMY_SP,
								kind: ast::VarDeclKind::Const,
								decls: vec![decl.clone()],
								declare: false,
								ctxt: swc_common::SyntaxContext::empty(),
							};
							unique_module_items.push(ast::ModuleItem::Stmt(ast::Stmt::Decl(
								ast::Decl::Var(Box::new(var_decl)),
							)));
						}
						RootVarDecl::Fn(decl) => {
							unique_module_items.push(ast::ModuleItem::Stmt(ast::Stmt::Decl(
								ast::Decl::Fn(decl.clone()),
							)));
						}
						RootVarDecl::Class(decl) => {
							unique_module_items.push(ast::ModuleItem::Stmt(ast::Stmt::Decl(
								ast::Decl::Class(decl.clone()),
							)));
						}
						RootVarDecl::TsEnum(decl) => {
							unique_module_items.push(ast::ModuleItem::Stmt(ast::Stmt::Decl(
								ast::Decl::TsEnum(decl.clone()),
							)));
						}
					}
				}
				migrated_ids.insert(var_id.clone());
			}
		}

		// Populate the segment's migrated_root_vars with deduplicated items
		segments[seg_idx].data.migrated_root_vars = unique_module_items;

		// CRITICAL: Remove migrated variables from segment's local_idents and scoped_idents
		// so that new_module() doesn't generate imports for them
		segments[seg_idx]
			.data
			.local_idents
			.retain(|id| !sorted_var_ids.contains(id));
		segments[seg_idx]
			.data
			.scoped_idents
			.retain(|id| !sorted_var_ids.contains(id));
	}

	migrated_ids
}

fn has_qrl_pattern(expr: &ast::Expr) -> bool {
	match expr {
		// Check for component$, routeAction$, routeLoader$, $(...) patterns
		ast::Expr::Call(call) => {
			// Check if callee is an identifier ending with $
			if let ast::Callee::Expr(box ast::Expr::Ident(ident)) = &call.callee {
				let name = ident.sym.as_ref();
				if name.ends_with('$') {
					return true;
				}
			}
			// Recursively check arguments
			call.args.iter().any(|arg| has_qrl_pattern(&arg.expr))
		}
		// Recursively check nested expressions
		ast::Expr::Paren(paren) => has_qrl_pattern(&paren.expr),
		ast::Expr::Seq(seq) => seq.exprs.iter().any(|e| has_qrl_pattern(e)),
		ast::Expr::Cond(cond) => {
			has_qrl_pattern(&cond.test) || has_qrl_pattern(&cond.cons) || has_qrl_pattern(&cond.alt)
		}
		ast::Expr::Bin(bin) => has_qrl_pattern(&bin.left) || has_qrl_pattern(&bin.right),
		ast::Expr::Unary(unary) => has_qrl_pattern(&unary.arg),
		ast::Expr::Update(update) => has_qrl_pattern(&update.arg),
		ast::Expr::Member(member) => has_qrl_pattern(&member.obj),
		ast::Expr::Array(array) => array
			.elems
			.iter()
			.any(|elem| elem.as_ref().is_some_and(|e| has_qrl_pattern(&e.expr))),
		ast::Expr::Object(obj) => obj.props.iter().any(|prop| match prop {
			ast::PropOrSpread::Prop(p) => match &**p {
				ast::Prop::KeyValue(kv) => has_qrl_pattern(&kv.value),
				ast::Prop::Shorthand(_) => false,
				ast::Prop::Assign(assign) => has_qrl_pattern(&assign.value),
				ast::Prop::Getter(_) | ast::Prop::Setter(_) | ast::Prop::Method(_) => false,
			},
			ast::PropOrSpread::Spread(_) => false,
		}),
		ast::Expr::Arrow(arrow) => {
			match &*arrow.body {
				ast::BlockStmtOrExpr::BlockStmt(_) => false, // Content handled by visitor
				ast::BlockStmtOrExpr::Expr(e) => has_qrl_pattern(e),
			}
		}
		_ => false,
	}
}

fn find_cyclic_migrated_vars(
	var_ids: &[Id],
	root_dependencies: &std::collections::HashMap<Id, RootVarDependency>,
) -> std::collections::HashSet<Id> {
	let var_set: std::collections::HashSet<Id> = var_ids.iter().cloned().collect();
	let mut graph: std::collections::HashMap<Id, Vec<Id>> = std::collections::HashMap::new();

	for var_id in var_ids {
		let deps = root_dependencies
			.get(var_id)
			.map(|dep_info| {
				dep_info
					.depends_on
					.iter()
					.filter(|dep| var_set.contains(*dep))
					.cloned()
					.collect::<Vec<_>>()
			})
			.unwrap_or_default();
		graph.insert(var_id.clone(), deps);
	}

	let mut cyclic = std::collections::HashSet::new();
	for var_id in var_ids {
		if let Some(deps) = graph.get(var_id) {
			for dep in deps {
				if dep == var_id {
					cyclic.insert(var_id.clone());
					break;
				}

				let mut visited = std::collections::HashSet::new();
				if path_exists(dep, var_id, &graph, &mut visited) {
					cyclic.insert(var_id.clone());
					break;
				}
			}
		}

		// Also mark as cyclic if initializer contains QRL patterns,
		// since these will create synthetic dependencies during transformation
		// that could cause forward references
		if let Some(dep_info) = root_dependencies.get(var_id) {
			if let RootVarDecl::Var(decl) = &dep_info.decl {
				if let Some(init) = &decl.init {
					if has_qrl_pattern(init) && var_ids.len() > 1 {
						// Only mark as cyclic if there are multiple vars being migrated
						// to ensure safe ordering with two-phase emission
						cyclic.insert(var_id.clone());
					}
				}
			}
		}
	}

	cyclic
}

fn path_exists(
	start: &Id,
	target: &Id,
	graph: &std::collections::HashMap<Id, Vec<Id>>,
	visited: &mut std::collections::HashSet<Id>,
) -> bool {
	if start == target {
		return true;
	}

	if !visited.insert(start.clone()) {
		return false;
	}

	if let Some(next_nodes) = graph.get(start) {
		for next in next_nodes {
			if path_exists(next, target, graph, visited) {
				return true;
			}
		}
	}

	false
}

fn create_cyclic_var_items(decl: &ast::VarDeclarator) -> Option<Vec<ast::ModuleItem>> {
	let ast::Pat::Ident(binding_ident) = &decl.name else {
		return None;
	};
	let init = decl.init.clone()?;

	let ident = binding_ident.id.clone();
	let ident_for_assign = ident.clone();
	let ident_for_let = ident;

	let let_decl = ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(Box::new(ast::VarDecl {
		span: swc_common::DUMMY_SP,
		kind: ast::VarDeclKind::Let,
		decls: vec![ast::VarDeclarator {
			span: decl.span,
			name: ast::Pat::Ident(ast::BindingIdent {
				id: ident_for_let,
				type_ann: None,
			}),
			init: None,
			definite: false,
		}],
		declare: false,
		ctxt: swc_common::SyntaxContext::empty(),
	}))));

	let assign_stmt = ast::ModuleItem::Stmt(ast::Stmt::Expr(ast::ExprStmt {
		span: swc_common::DUMMY_SP,
		expr: Box::new(ast::Expr::Assign(ast::AssignExpr {
			span: swc_common::DUMMY_SP,
			op: ast::AssignOp::Assign,
			left: ast::AssignTarget::Simple(ast::SimpleAssignTarget::Ident(ast::BindingIdent {
				id: ident_for_assign,
				type_ann: None,
			})),
			right: init,
		})),
	}));

	Some(vec![let_decl, assign_stmt])
}

fn sort_migrated_vars_topologically(
	var_ids: &[Id],
	root_dependencies: &std::collections::HashMap<Id, RootVarDependency>,
) -> Vec<Id> {
	if var_ids.len() <= 1 {
		return var_ids.to_vec();
	}

	let var_set: std::collections::HashSet<Id> = var_ids.iter().cloned().collect();
	let mut indegree: std::collections::HashMap<Id, usize> =
		var_ids.iter().cloned().map(|id| (id, 0usize)).collect();
	let mut outgoing: std::collections::HashMap<Id, Vec<Id>> =
		var_ids.iter().cloned().map(|id| (id, Vec::new())).collect();

	for var_id in var_ids {
		if let Some(dep_info) = root_dependencies.get(var_id) {
			for dep_id in &dep_info.depends_on {
				// For dependencies, ignore self-references (a variable depending on itself)
				// These create cycles that can't be topologically sorted
				if dep_id == var_id {
					continue;
				}
				if !var_set.contains(dep_id) {
					continue;
				}
				if let Some(out) = outgoing.get_mut(dep_id) {
					out.push(var_id.clone());
				}
				if let Some(deg) = indegree.get_mut(var_id) {
					*deg += 1;
				}
			}
		}
	}

	let sort_key = |var_id: &Id| {
		let span = root_dependencies
			.get(var_id)
			.map(|dep| root_decl_span(&dep.decl))
			.unwrap_or(DUMMY_SP);
		(span.lo.0, span.hi.0, var_id.0.to_string())
	};

	let mut ready: Vec<Id> = indegree
		.iter()
		.filter_map(|(id, deg)| if *deg == 0 { Some(id.clone()) } else { None })
		.collect();
	ready.sort_by_key(&sort_key);

	let mut result = Vec::with_capacity(var_ids.len());
	while let Some(next) = ready.first().cloned() {
		ready.remove(0);
		result.push(next.clone());

		if let Some(children) = outgoing.get(&next) {
			for child in children {
				if let Some(deg) = indegree.get_mut(child) {
					*deg = deg.saturating_sub(1);
					if *deg == 0 {
						ready.push(child.clone());
					}
				}
			}
		}
		ready.sort_by_key(&sort_key);
	}

	if result.len() == var_ids.len() {
		result
	} else {
		let mut fallback = var_ids.to_vec();
		fallback.sort_by_key(sort_key);
		fallback
	}
}

/// This runs BEFORE the actual variable migration to ensure all dependencies are known upfront.
/// This prevents issues where migrated variables have dependencies that weren't exported yet.
fn precompute_and_declare_auto_exports(
	module: &mut ast::Module,
	global_collect: &mut crate::collector::GlobalCollect,
	migratable: &std::collections::BTreeMap<usize, Vec<Id>>,
	root_dependencies: &std::collections::HashMap<Id, RootVarDependency>,
) {
	if migratable.is_empty() {
		return;
	}

	// Build a map of which segment each variable is being migrated to
	let segment_assignment: std::collections::BTreeMap<Id, usize> = migratable
		.iter()
		.flat_map(|(seg_idx, vars)| vars.iter().map(move |var_id| (var_id.clone(), *seg_idx)))
		.collect();

	let mut exports_to_declare = std::collections::BTreeMap::new();

	// Step 1: Analyze what segments need and identify required exports
	for (seg_idx, vars) in migratable {
		for var_id in vars {
			if let Some(dep_info) = root_dependencies.get(var_id) {
				// Step 2: Check if dependencies of this variable need to be exported
				for dep_id in &dep_info.depends_on {
					// Skip if dependency is not in root, or if it's being migrated to same segment
					if !global_collect.root.contains_key(dep_id) {
						continue;
					}

					if let Some(dep_segment) = segment_assignment.get(dep_id) {
						// Dependency is also being migrated to same segment - no export needed
						if *dep_segment == *seg_idx {
							continue;
						}
					}

					// Check if dependency is already imported/exported
					if let Some(dep_info) = root_dependencies.get(dep_id) {
						if dep_info.is_imported || dep_info.is_exported {
							continue;
						}
					}

					// This dependency needs to be exported
					if !exports_to_declare.contains_key(dep_id) {
						exports_to_declare.insert(dep_id.clone(), format!("_auto_{}", dep_id.0));
					}
				}
			}
		}
	}

	// Step 3: Now declare all exports we computed
	// This happens before any variable migration, so all dependencies are known upfront
	for (id, exported_name) in exports_to_declare {
		if global_collect.add_export(id.clone(), Some(exported_name.clone().into())) {
			module.body.push(create_synthetic_named_export(
				&id,
				Some(exported_name.into()),
			));
		}
	}
}

fn root_decl_span(decl: &RootVarDecl) -> Span {
	match decl {
		RootVarDecl::Var(var) => var.span,
		RootVarDecl::Fn(func) => func.function.span,
		RootVarDecl::Class(class) => class.class.span,
		RootVarDecl::TsEnum(enu) => enu.span,
	}
}

/// Removes exports and variable declarations for migrated variables from the root module.
/// These variables are now defined in their respective segment files.
fn remove_migrated_exports(module: &mut ast::Module, migrated_ids: &std::collections::HashSet<Id>) {
	if migrated_ids.is_empty() {
		return;
	}

	module.body.retain_mut(|item| {
		match item {
			// Remove export statements for migrated variables
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportNamed(export)) => {
				export.specifiers.retain(|spec| {
					if let ast::ExportSpecifier::Named(named) = spec {
						if let ast::ModuleExportName::Ident(orig_ident) = &named.orig {
							!migrated_ids.contains(&(orig_ident.sym.clone(), orig_ident.ctxt))
						} else {
							true
						}
					} else {
						true
					}
				});
				// Keep the export only if there are still specifiers
				!export.specifiers.is_empty()
			}
			// Remove/filter variable declarations for migrated variables
			ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(var_decl))) => {
				var_decl.decls.retain(|decl| {
					let mut ids = Vec::new();
					let _ = collect_from_pat(&decl.name, &mut ids);
					!ids.iter().any(|(id, _)| migrated_ids.contains(id))
				});
				// Return true only if there are declarators left
				!var_decl.decls.is_empty()
			}
			ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Fn(function))) => {
				!migrated_ids.contains(&(function.ident.sym.clone(), function.ident.ctxt))
			}
			ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Class(class))) => {
				!migrated_ids.contains(&(class.ident.sym.clone(), class.ident.ctxt))
			}
			ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::TsEnum(enu))) => {
				!migrated_ids.contains(&(enu.id.sym.clone(), enu.id.ctxt))
			}
			_ => true,
		}
	});
}

/// After variable migration, some `const _qrl_*` / `const i_*` declarations and
/// their associated imports may become unused in the root module. SWC's DCE can't
/// remove these because `may_have_side_effects` returns true for all Call expressions.
/// This function does a targeted cleanup: it iteratively removes unreferenced
/// `_qrl_*`/`i_*` const declarations and then unreferenced import declarations.
fn remove_unused_qrl_declarations(module: &mut ast::Module) {
	use std::collections::HashSet;
	use swc_ecmascript::visit::Visit;

	/// Collect all identifiers referenced in expressions (not declarations)
	struct RefCollector {
		refs: HashSet<Atom>,
	}
	impl Visit for RefCollector {
		fn visit_ident(&mut self, ident: &ast::Ident) {
			self.refs.insert(ident.sym.clone());
		}
	}

	// Iterate until stable (removing a qrl const may make an import unused)
	loop {
		// 1. Collect all identifiers DEFINED by const _qrl_*/i_* declarations and imports
		let mut qrl_defined: HashSet<Atom> = HashSet::new();
		let mut import_defined: HashSet<Atom> = HashSet::new();
		for item in &module.body {
			match item {
				ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(var))) => {
					for decl in &var.decls {
						if let ast::Pat::Ident(ident) = &decl.name {
							let name = &*ident.id.sym;
							if name.starts_with("_qrl_") || name.starts_with("i_") {
								qrl_defined.insert(ident.id.sym.clone());
							}
						}
					}
				}
				ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(import_decl)) => {
					for spec in &import_decl.specifiers {
						let sym = match spec {
							ast::ImportSpecifier::Named(n) => &n.local.sym,
							ast::ImportSpecifier::Default(d) => &d.local.sym,
							ast::ImportSpecifier::Namespace(ns) => &ns.local.sym,
						};
						import_defined.insert(sym.clone());
					}
				}
				_ => {}
			}
		}
		if qrl_defined.is_empty() && import_defined.is_empty() {
			break;
		}

		// 2. Collect all identifiers referenced by NON-qrl-const, NON-import items
		let mut used: HashSet<Atom> = HashSet::new();
		for item in &module.body {
			let is_removable = match item {
				ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(var))) => {
					var.decls.iter().all(|decl| {
						if let ast::Pat::Ident(ident) = &decl.name {
							let name = &*ident.id.sym;
							name.starts_with("_qrl_") || name.starts_with("i_")
						} else {
							false
						}
					})
				}
				ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(_)) => true,
				_ => false,
			};
			if !is_removable {
				let mut collector = RefCollector {
					refs: HashSet::new(),
				};
				item.visit_with(&mut collector);
				used.extend(collector.refs);
			}
		}

		// Also collect refs from qrl/import items to each other
		// (a qrl const may reference an import, and a used qrl should keep its imports)
		let mut changed = true;
		while changed {
			changed = false;
			for item in &module.body {
				let defined_sym = match item {
					ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(var))) => {
						var.decls.first().and_then(|decl| {
							if let ast::Pat::Ident(ident) = &decl.name {
								let name = &*ident.id.sym;
								if name.starts_with("_qrl_") || name.starts_with("i_") {
									Some(ident.id.sym.clone())
								} else {
									None
								}
							} else {
								None
							}
						})
					}
					ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(import_decl)) => {
						import_decl.specifiers.first().map(|spec| match spec {
							ast::ImportSpecifier::Named(n) => n.local.sym.clone(),
							ast::ImportSpecifier::Default(d) => d.local.sym.clone(),
							ast::ImportSpecifier::Namespace(ns) => ns.local.sym.clone(),
						})
					}
					_ => None,
				};
				if let Some(sym) = defined_sym {
					if used.contains(&sym) {
						// This item is used; mark its references as used too
						let mut collector = RefCollector {
							refs: HashSet::new(),
						};
						item.visit_with(&mut collector);
						for r in collector.refs {
							if used.insert(r) {
								changed = true;
							}
						}
					}
				}
			}
		}

		// 3. Remove unused qrl declarations and imports
		let before_len = module.body.len();
		module.body.retain(|item| {
			match item {
				ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(var))) => {
					// Remove _qrl_*/i_* const declarations that are unused
					!var.decls.iter().all(|decl| {
						if let ast::Pat::Ident(ident) = &decl.name {
							let name = &*ident.id.sym;
							(name.starts_with("_qrl_") || name.starts_with("i_"))
								&& !used.contains(&ident.id.sym)
						} else {
							false
						}
					})
				}
				ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(import_decl)) => {
					// Remove imports where all specifiers are unused
					if import_decl.specifiers.is_empty() {
						return true; // Keep side-effect imports
					}
					!import_decl.specifiers.iter().all(|spec| {
						let sym = match spec {
							ast::ImportSpecifier::Named(n) => &n.local.sym,
							ast::ImportSpecifier::Default(d) => &d.local.sym,
							ast::ImportSpecifier::Namespace(ns) => &ns.local.sym,
						};
						!used.contains(sym)
					})
				}
				_ => true,
			}
		});

		if module.body.len() == before_len {
			break; // No more items removed, stable
		}
	}
}

#[cfg(test)]
mod migration_cleanup_tests {
	use super::*;
	use std::collections::HashSet;
	use swc_atoms::{atom, Atom};
	use swc_common::{Globals, Mark, SyntaxContext, DUMMY_SP, GLOBALS};

	#[test]
	fn remove_migrated_exports_keeps_same_symbol_different_context() {
		GLOBALS.set(&Globals::new(), || {
			let ctxt_a = SyntaxContext::empty();
			let ctxt_b = SyntaxContext::empty().apply_mark(Mark::new());

			let ident_a = ast::Ident::new(atom!("RouteStateContext"), DUMMY_SP, ctxt_a);
			let ident_b = ast::Ident::new(atom!("RouteStateContext"), DUMMY_SP, ctxt_b);

			let make_decl = |ident: ast::Ident, value: &str| {
				let var_decl = ast::VarDecl {
					span: DUMMY_SP,
					ctxt: Default::default(),
					kind: ast::VarDeclKind::Const,
					declare: false,
					decls: vec![ast::VarDeclarator {
						span: DUMMY_SP,
						name: ast::Pat::Ident(ast::BindingIdent {
							id: ident,
							type_ann: None,
						}),
						init: Some(Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
							span: DUMMY_SP,
							value: Atom::from(value),
							raw: None,
						})))),
						definite: false,
					}],
				};
				ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(Box::new(var_decl))))
			};

			let mut module = ast::Module {
				span: DUMMY_SP,
				shebang: None,
				body: vec![
					make_decl(ident_a.clone(), "a"),
					make_decl(ident_b.clone(), "b"),
				],
			};

			let mut migrated_ids: HashSet<Id> = HashSet::new();
			migrated_ids.insert((ident_a.sym.clone(), ident_a.ctxt));

			remove_migrated_exports(&mut module, &migrated_ids);

			assert_eq!(module.body.len(), 1);
			match &module.body[0] {
				ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(var_decl))) => {
					assert_eq!(var_decl.decls.len(), 1);
					if let ast::Pat::Ident(binding) = &var_decl.decls[0].name {
						assert_eq!(binding.id.sym, atom!("RouteStateContext"));
						assert_eq!(binding.id.ctxt, ctxt_b);
					} else {
						panic!("expected ident pattern");
					}
				}
				_ => panic!("expected var decl"),
			}
		});
	}

	#[test]
	fn find_cyclic_migrated_vars_detects_self_and_mutual_cycles() {
		let id_a: Id = (atom!("a"), SyntaxContext::empty());
		let id_b: Id = (atom!("b"), SyntaxContext::empty());
		let id_c: Id = (atom!("c"), SyntaxContext::empty());

		let mk_decl = |name: &str| {
			RootVarDecl::Var(ast::VarDeclarator {
				span: DUMMY_SP,
				name: ast::Pat::Ident(ast::BindingIdent {
					id: ast::Ident::new(name.into(), DUMMY_SP, SyntaxContext::empty()),
					type_ann: None,
				}),
				init: None,
				definite: false,
			})
		};

		let mut deps = HashMap::new();
		deps.insert(
			id_a.clone(),
			RootVarDependency {
				decl: mk_decl("a"),
				is_imported: false,
				is_exported: false,
				depends_on: vec![id_a.clone()],
			},
		);
		deps.insert(
			id_b.clone(),
			RootVarDependency {
				decl: mk_decl("b"),
				is_imported: false,
				is_exported: false,
				depends_on: vec![id_c.clone()],
			},
		);
		deps.insert(
			id_c.clone(),
			RootVarDependency {
				decl: mk_decl("c"),
				is_imported: false,
				is_exported: false,
				depends_on: vec![id_b.clone()],
			},
		);

		let cyclic = find_cyclic_migrated_vars(&[id_a.clone(), id_b.clone(), id_c.clone()], &deps);
		assert!(cyclic.contains(&id_a));
		assert!(cyclic.contains(&id_b));
		assert!(cyclic.contains(&id_c));
	}

	#[test]
	fn create_cyclic_var_items_emits_let_then_assign() {
		let decl = ast::VarDeclarator {
			span: DUMMY_SP,
			name: ast::Pat::Ident(ast::BindingIdent {
				id: ast::Ident::new(atom!("foo"), DUMMY_SP, SyntaxContext::empty()),
				type_ann: None,
			}),
			init: Some(Box::new(ast::Expr::Lit(ast::Lit::Num(ast::Number {
				span: DUMMY_SP,
				value: 1.0,
				raw: None,
			})))),
			definite: false,
		};

		let items = create_cyclic_var_items(&decl).expect("should build cyclic items");
		assert_eq!(items.len(), 2);

		match &items[0] {
			ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(var_decl))) => {
				assert_eq!(var_decl.kind, ast::VarDeclKind::Let);
				assert_eq!(var_decl.decls.len(), 1);
			}
			_ => panic!("expected leading let declaration"),
		}

		match &items[1] {
			ast::ModuleItem::Stmt(ast::Stmt::Expr(ast::ExprStmt { expr, .. })) => {
				assert!(matches!(&**expr, ast::Expr::Assign(_)));
			}
			_ => panic!("expected trailing assignment statement"),
		}
	}
}
