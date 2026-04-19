use crate::code_move::transform_function_expr;
use crate::collector::{
	collect_from_pat, new_ident_from_id, GlobalCollect, Id, IdentCollector, ImportKind,
};
use crate::entry_strategy::EntryPolicy;
use crate::inlined_fn::{convert_inlined_fn, render_expr};
use crate::is_const::is_const_expr;
use crate::parse::{EmitMode, PathData};

use crate::words::*;
use crate::{errors, EntryStrategy};
use base64::Engine;
use path_slash::PathExt;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt::Write as _;
use std::hash::Hash;
use std::hash::Hasher; // import without risk of name clashing
use std::iter;
use std::str;
use swc_atoms::{atom, Atom};
use swc_common::comments::{Comments, SingleThreadedComments};
use swc_common::SyntaxContext;
use swc_common::{sync::Lrc, SourceMap, Span, Spanned, DUMMY_SP};
use swc_ecmascript::ast::{self, SpreadElement};
use swc_ecmascript::utils::{private_ident, quote_ident, ExprFactory};
use swc_ecmascript::visit::{noop_fold_type, noop_visit_type, Fold, FoldWith, Visit, VisitWith};

mod disable_next_line_directive;
use disable_next_line_directive::DisabledDiagnostics;

macro_rules! id {
	($ident: expr) => {
		($ident.sym.clone(), $ident.ctxt)
	};
}

macro_rules! id_eq {
	($ident: expr, $cid: expr) => {
		if let Some(cid) = $cid {
			cid.0 == $ident.sym && cid.1 == $ident.ctxt
		} else {
			false
		}
	};
}

const WORKER_QRL_CHUNK_SENTINEL: &str = "__QWIK_WORKER_QRL__:";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SegmentKind {
	Function,
	EventHandler,
	JSXProp,
}

#[derive(Debug, Clone)]
pub struct Segment {
	pub entry: Option<Atom>,
	pub canonical_filename: Atom,
	pub name: Atom,
	pub expr: Box<ast::Expr>,
	pub data: SegmentData,
	pub hash: u64,
	pub span: Span,
	pub param_names: Option<Vec<Atom>>,
	/// For Hoist strategy: the qrl_id (e.g. q_Symbol_name) to emit .s() alongside the const
	pub qrl_id: Option<Id>,
}

#[derive(Debug, Clone)]
pub enum Captures {
	Auto(Vec<Id>),
	Explicit(ast::ArrayLit),
}

#[derive(Debug, Clone)]
pub struct SegmentData {
	pub extension: Atom,
	pub local_idents: Vec<Id>,
	pub scoped_idents: Vec<Id>,
	pub captures: Captures,
	pub parent_segment: Option<Atom>,
	pub ctx_kind: SegmentKind,
	pub ctx_name: Atom,
	pub origin: Atom,
	pub path: Atom,
	pub display_name: Atom,
	pub hash: Atom,
	pub need_transform: bool,
	pub migrated_root_vars: Vec<ast::ModuleItem>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum IdentType {
	Var(bool),
	Fn,
	Class,
}

pub type IdPlusType = (Id, IdentType);

/// Context for adding props to appropriate lists
#[derive(Clone, Copy)]
struct PropAddContext {
	is_const: bool,
	is_fn: bool,
	spread_props_count: usize,
}

#[derive(Clone, Copy)]
struct TransformJsxPropContext<'a> {
	is_fn: bool,
	passive_events: &'a HashSet<String>,
	should_sort: bool,
	is_target_const_props: bool,
}

struct ImportQrlName {
	display_name: String,
	hash_seed: String,
}

#[allow(clippy::module_name_repetitions)]
pub struct QwikTransform<'a> {
	pub segments: Vec<Segment>,
	pub options: QwikTransformOptions<'a>,

	segment_names: HashMap<String, u32>,
	pub extra_top_items: BTreeMap<Id, ast::ModuleItem>,
	extra_bottom_items: BTreeMap<Id, ast::ModuleItem>,
	stack_ctxt: Vec<String>,
	decl_stack: Vec<Vec<IdPlusType>>,
	marker_functions: HashMap<Id, Atom>,
	jsx_functions: HashSet<Id>,
	immutable_function_cmp: HashSet<Id>,
	qcomponent_fn: Option<Id>,
	qsegment_fn: Option<Id>,
	inlined_qrl_fn: Option<Id>,
	sync_qrl_fn: Option<Id>,
	h_fn: Option<Id>,
	fragment_fn: Option<Id>,
	fn_signal_fn: Option<Id>,

	jsx_mutable: bool,

	segment_stack: Vec<Atom>,
	file_hash: u64,
	jsx_key_counter: u32,
	root_jsx_mode: bool,
	jsx_element_is_native: Vec<bool>,
	jsx_element_passive_events: Vec<HashSet<String>>,
	hoisted_fn_signals: HashMap<String, Id>,
	hoisted_fn_counter: u32,
	iteration_var_stack: Vec<Vec<ast::Ident>>,
	hoisted_qrls: Vec<Vec<(String, ast::VarDeclarator)>>,
	/// For each hoisting scope, the decl_stack index of that function/arrow (used to map decl scope back to hoisted_qrls).
	hoisting_scope_decl_indices: Vec<usize>,
	/// Depths that are component boundaries (not loop callbacks). Used to hoist QRLs with captures to the current component's top.
	component_depths: Vec<usize>,
	in_callback: bool,
	/// Stores post-fold const initializers for inlining into segments when
	/// a $ call receives a simple identifier referencing a local const.
	const_initializers: HashMap<Id, Box<ast::Expr>>,
	/// setRef call statements for inlined QRLs, inserted at module scope
	pub ref_assignments: Vec<ast::ModuleItem>,
	/// Segment idents whose .s() calls are emitted by the Hoist drain, not ref_assignments
	hoisted_segment_idents: HashSet<Id>,
	disabled_diagnostics: DisabledDiagnostics,
	/// Pending expression replacement for fold_expr (to return non-CallExpr from fold_call_expr)
	pending_expr_replacement: Option<ast::Expr>,
}

pub struct QwikTransformOptions<'a> {
	pub path_data: &'a PathData,
	pub dev_path: Option<&'a str>,
	pub entry_policy: &'a dyn EntryPolicy,
	pub extension: Atom,
	pub core_module: Atom,
	pub explicit_extensions: bool,
	pub comments: Option<&'a SingleThreadedComments>,
	pub global_collect: GlobalCollect,
	pub scope: Option<&'a String>,
	pub mode: EmitMode,
	pub entry_strategy: EntryStrategy,
	pub reg_ctx_name: Option<&'a [Atom]>,
	pub strip_ctx_name: Option<&'a [Atom]>,
	pub strip_event_handlers: bool,
	pub is_server: bool,
	pub cm: Lrc<SourceMap>,
}

fn convert_qrl_word(id: &Atom) -> Option<Atom> {
	let ident_name = id.as_ref();
	let needs_qrl = ident_name.ends_with(QRL_SUFFIX);
	if needs_qrl {
		let new_specifier = [&ident_name[0..ident_name.len() - 1], LONG_SUFFIX].concat();
		Some(Atom::from(new_specifier))
	} else {
		None
	}
}
impl<'a> QwikTransform<'a> {
	pub fn new(options: QwikTransformOptions<'a>) -> Self {
		let mut marker_functions = HashMap::new();
		for (id, import) in options.global_collect.imports.iter() {
			if import.kind == ImportKind::Named && import.specifier.ends_with(QRL_SUFFIX) {
				marker_functions.insert(id.clone(), import.specifier.clone());
			}
		}

		for id in options.global_collect.export_local_ids() {
			if id.0.ends_with(QRL_SUFFIX) {
				marker_functions.insert(id.clone(), id.0.clone());
			}
		}

		let mut hasher = DefaultHasher::new();
		let local_file_name = options.path_data.rel_path.to_slash_lossy();
		if let Some(scope) = options.scope {
			hasher.write(scope.as_bytes());
		}
		hasher.write(local_file_name.as_bytes());

		let jsx_functions = options
			.global_collect
			.imports
			.iter()
			.flat_map(|(id, import)| {
				match (
					import.kind,
					import.source.as_ref(),
					import.specifier.as_ref(),
				) {
					(ImportKind::Named, "@qwik.dev/core", "jsx") => Some(id.clone()),
					(ImportKind::Named, "@qwik.dev/core", "jsxs") => Some(id.clone()),
					(ImportKind::Named, "@qwik.dev/core", "jsxDEV") => Some(id.clone()),
					(ImportKind::Named, "@qwik.dev/core/jsx-runtime", _) => Some(id.clone()),
					(ImportKind::Named, "@qwik.dev/core/jsx-dev-runtime", _) => Some(id.clone()),
					_ => None,
				}
			})
			.collect();

		let immutable_function_cmp = options
			.global_collect
			.imports
			.iter()
			.flat_map(|(id, import)| {
				match (
					import.kind,
					import.source.as_ref(),
					import.specifier.as_ref(),
				) {
					(
						ImportKind::Named,
						"@qwik.dev/core/jsx-runtime" | "@qwik.dev/core/jsx-dev-runtime",
						"Fragment",
					) => Some(id.clone()),
					(ImportKind::Named, "@qwik.dev/core", "Fragment" | "RenderOnce") => {
						Some(id.clone())
					}
					(ImportKind::Named, "@qwik.dev/router", "Link") => Some(id.clone()),
					(_, source, _) => {
						if source.ends_with("?jsx") || source.ends_with(".md") {
							Some(id.clone())
						} else {
							None
						}
					}
				}
			})
			.collect();

		let disabled_diagnostics = Self::collect_disabled_diagnostics(&options);

		QwikTransform {
			file_hash: hasher.finish(),
			jsx_key_counter: 0,
			stack_ctxt: Vec::with_capacity(16),
			decl_stack: Vec::with_capacity(32),
			segments: Vec::with_capacity(16),
			segment_stack: Vec::with_capacity(16),
			extra_top_items: BTreeMap::new(),
			extra_bottom_items: BTreeMap::new(),

			segment_names: HashMap::new(),
			qcomponent_fn: options
				.global_collect
				.get_imported_local(&QCOMPONENT, &options.core_module),
			sync_qrl_fn: options
				.global_collect
				.get_imported_local(&Q_SYNC, &options.core_module),
			qsegment_fn: options
				.global_collect
				.get_imported_local(&QSEGMENT, &options.core_module),
			inlined_qrl_fn: options
				.global_collect
				.get_imported_local(&_INLINED_QRL, &options.core_module),
			h_fn: options
				.global_collect
				.get_imported_local(&H, &options.core_module),
			fragment_fn: options
				.global_collect
				.get_imported_local(&FRAGMENT, &options.core_module),
			fn_signal_fn: options
				.global_collect
				.get_imported_local(&_INLINED_FN, &options.core_module),
			marker_functions,
			jsx_functions,
			immutable_function_cmp,
			root_jsx_mode: true,
			jsx_mutable: false,
			jsx_element_is_native: Vec::new(),
			jsx_element_passive_events: Vec::new(),
			hoisted_fn_signals: HashMap::new(),
			hoisted_fn_counter: 0,
			iteration_var_stack: Vec::new(),
			hoisted_qrls: Vec::new(),
			hoisting_scope_decl_indices: Vec::new(),
			component_depths: Vec::new(),
			in_callback: false,
			const_initializers: HashMap::new(),
			ref_assignments: Vec::new(),
			hoisted_segment_idents: HashSet::new(),
			disabled_diagnostics,
			pending_expr_replacement: None,
			options,
		}
	}

	const fn is_inline(&self) -> bool {
		matches!(
			self.options.entry_strategy,
			EntryStrategy::Inline | EntryStrategy::Hoist
		)
	}

	fn get_dev_location(&self, span: Span) -> ast::ExprOrSpread {
		let loc = self.options.cm.lookup_char_pos(span.lo);
		let file_name = self
			.options
			.dev_path
			.map(|p| p.to_string())
			.unwrap_or_else(|| self.options.path_data.rel_path.to_slash_lossy().to_string());
		ast::ExprOrSpread {
			spread: None,
			expr: Box::new(ast::Expr::Object(ast::ObjectLit {
				span: DUMMY_SP,
				props: vec![
					ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
						key: ast::PropName::Ident(quote_ident!("fileName")),
						value: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
							span: DUMMY_SP,
							raw: None,
							value: file_name.into(),
						}))),
					}))),
					ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
						key: ast::PropName::Ident(quote_ident!("lineNumber")),
						value: loc.line.into(),
					}))),
					ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
						key: ast::PropName::Ident(quote_ident!("columnNumber")),
						value: (loc.col.0 + 1).into(),
					}))),
				],
			})),
		}
	}

	fn register_context_name(
		&mut self,
		custom_symbol: Option<Atom>,
		display_name_override: Option<&str>,
		hash_override: Option<&str>,
	) -> (Atom, Atom, Atom, u64) {
		if let Some(custom_symbol) = custom_symbol {
			return (
				custom_symbol.clone(),
				custom_symbol.clone(),
				custom_symbol,
				0,
			);
		}
		let mut display_name = display_name_override
			.map(ToOwned::to_owned)
			.unwrap_or_else(|| {
				let mut display_name = self.stack_ctxt.join("_");
				if self.stack_ctxt.is_empty() {
					display_name += "s_";
				}
				display_name
			});
		display_name = escape_sym(&display_name);
		let first_char = display_name.chars().next();
		if first_char.is_some_and(|c| c.is_ascii_digit()) {
			display_name = format!("_{}", display_name);
		}
		let index = match self.segment_names.get_mut(&display_name) {
			Some(count) => {
				*count += 1;
				*count
			}
			None => 0,
		};
		if index == 0 {
			self.segment_names.insert(display_name.clone(), 0);
		} else {
			write!(display_name, "_{}", index).unwrap();
		}
		let mut hasher = DefaultHasher::new();
		if let Some(hash_override) = hash_override {
			hasher.write(hash_override.as_bytes());
		} else {
			let local_file_name = self.options.path_data.rel_path.to_slash_lossy();
			if let Some(scope) = self.options.scope {
				hasher.write(scope.as_bytes());
			}
			hasher.write(local_file_name.as_bytes());
			hasher.write(display_name.as_bytes());
		}
		let hash = hasher.finish();
		let hash64 = base64(hash);

		let symbol_name = if matches!(
			self.options.mode,
			EmitMode::Dev | EmitMode::Test | EmitMode::Hmr | EmitMode::Lib
		) {
			format!("{}_{}", display_name, hash64)
		} else {
			format!("s_{}", hash64)
		};
		display_name = format!("{}_{}", &self.options.path_data.file_name, display_name);
		(
			Atom::from(symbol_name),
			Atom::from(display_name),
			Atom::from(hash64),
			hash,
		)
	}

	fn get_import_qrl_name(&self, expr: &ast::Expr) -> Option<ImportQrlName> {
		let (source, import_name, display_name) = match expr {
			ast::Expr::Ident(ident) => {
				let import = self.options.global_collect.imports.get(&id!(ident))?;
				let source = self.resolve_import_hash_path(import.source.as_ref())?;
				(
					source.clone(),
					import.specifier.to_string(),
					self.create_import_display_name(&source, import.specifier.as_ref()),
				)
			}
			ast::Expr::Member(member) => {
				let ast::Expr::Ident(root_ident) = member.obj.as_ref() else {
					return None;
				};
				let import = self.options.global_collect.imports.get(&id!(root_ident))?;
				if import.kind != ImportKind::All {
					return None;
				}
				let ast::MemberProp::Ident(import_name) = &member.prop else {
					return None;
				};
				let source = self.resolve_import_hash_path(import.source.as_ref())?;
				(
					source.clone(),
					import_name.sym.to_string(),
					self.create_import_display_name(&source, import_name.sym.as_ref()),
				)
			}
			_ => return None,
		};

		Some(ImportQrlName {
			display_name,
			hash_seed: format!("{}#{}", source, import_name),
		})
	}

	fn resolve_import_hash_path(&self, import_path: &str) -> Option<String> {
		let normalized = import_path.replace('\\', "/");
		if !normalized.starts_with('.') {
			return Some(normalized);
		}

		let base_dir = self.options.path_data.rel_dir.to_slash_lossy();
		let mut segments: Vec<&str> = base_dir
			.split('/')
			.filter(|segment| !segment.is_empty())
			.collect();

		for segment in normalized.split('/') {
			match segment {
				"" | "." => {}
				".." => {
					segments.pop()?;
				}
				segment => segments.push(segment),
			}
		}

		Some(segments.join("/"))
	}

	fn create_import_display_name(&self, source: &str, import_name: &str) -> String {
		let path_tail = source.rsplit('/').next().unwrap_or(source);
		let base_name = escape_sym(path_tail);
		if import_name == "default" {
			base_name
		} else {
			format!("{}_{}", base_name, escape_sym(import_name))
		}
	}

	/** Parse inlinedQrl() (from library code) */
	fn handle_inlined_qsegment(&mut self, mut node: ast::CallExpr) -> ast::CallExpr {
		// Library mode: pass through existing inlinedQrl calls unchanged
		if matches!(self.options.mode, EmitMode::Lib) {
			return node;
		}
		// If the first argument of the call is `null`, we skip processing
		if let Some(ast::ExprOrSpread {
			expr: first_arg, ..
		}) = node.args.first()
		{
			if let ast::Expr::Lit(ast::Lit::Null(_)) = **first_arg {
				return node;
			}
		}
		node.args.reverse();

		let last_stack = self
			.stack_ctxt
			.last()
			.map_or_else(|| QSEGMENT.clone(), |last| Atom::from(last.as_str()));

		let ctx_name = if last_stack.ends_with("Qrl") {
			Atom::from(format!("{}$", last_stack.trim_end_matches("Qrl")))
		} else {
			last_stack
		};
		let ctx_kind = if ctx_name.starts_with("on") {
			SegmentKind::JSXProp
		} else {
			SegmentKind::Function
		};
		let first_arg = node
			.args
			.pop()
			.expect("inlinedQrl() should always have the first argument");

		let second_arg = node
			.args
			.pop()
			.expect("inlinedQrl() should always have the second argument");

		let third_arg = node.args.pop();
		let span = first_arg.span();

		let (symbol_name, display_name, hash) = {
			let symbol_name = match *second_arg.expr {
				ast::Expr::Lit(ast::Lit::Str(string)) => string.value,
				_ => unreachable!("checked above"),
			};
			parse_symbol_name(
				symbol_name,
				matches!(
					self.options.mode,
					EmitMode::Dev | EmitMode::Test | EmitMode::Hmr
				),
				&self.options.path_data.file_name,
			)
		};

		self.segment_stack.push(symbol_name.clone());
		let folded = *first_arg.expr.fold_with(self);
		self.segment_stack.pop();

		// Inline const initializer if the value is a simple ident referencing a local const.
		// This fixes cases like `const STYLE = '...'; inlinedQrl(STYLE, 'name')`
		// where the entry point would otherwise reference an undefined identifier.
		// For Inline/Hoist strategies, skip: the .s() call will use the ident directly
		// (at module scope for globals, or inline via comma expr for non-globals).
		// Skip inlining for exported identifiers: the chunk can import them from the parent
		// module, so inlining their initializer is unnecessary and may cause referenced
		// module-level variables to be incorrectly moved into the chunk.
		let folded = if !self.is_inline() {
			if let ast::Expr::Ident(ref ident) = folded {
				if !self.options.global_collect.has_export_symbol(&ident.sym) {
					if let Some(init) = self.const_initializers.get(&id!(ident)) {
						*init.clone()
					} else {
						folded
					}
				} else {
					folded
				}
			} else {
				folded
			}
		} else {
			folded
		};

		let (scoped_idents, captures) = {
			if let Some(scoped) = third_arg {
				match &*scoped.expr {
					ast::Expr::Array(array) => {
						let idents: Vec<Id> = array
							.elems
							.iter()
							.flat_map(|item| match &*item.as_ref().unwrap().expr {
								ast::Expr::Ident(ident) => Some(id!(ident)),
								_ => None,
							})
							.collect();
						if idents.len() < array.elems.len() {
							(idents, Captures::Explicit(array.clone()))
						} else {
							(idents.clone(), Captures::Auto(idents))
						}
					}
					_ => (vec![], Captures::Auto(vec![])),
				}
			} else {
				let descendent_idents = {
					let mut collector = IdentCollector::new();
					folded.visit_with(&mut collector);
					collector.get_words()
				};
				let (decl_collect, _): (Vec<_>, Vec<_>) = self
					.decl_stack
					.iter()
					.flat_map(|v| v.iter())
					.cloned()
					.partition(|(_, t)| matches!(t, IdentType::Var(_)));
				let (scoped, _) = compute_scoped_idents(&descendent_idents, &decl_collect);
				(scoped.clone(), Captures::Auto(scoped))
			}
		};
		let local_idents = self.get_local_idents(&folded);
		let segment_data = SegmentData {
			extension: self.options.extension.clone(),
			local_idents,
			scoped_idents,
			captures,
			parent_segment: self.segment_stack.last().cloned(),
			ctx_kind,
			ctx_name,
			origin: self.options.path_data.rel_path.to_slash_lossy().into(),
			path: self.options.path_data.rel_dir.to_slash_lossy().into(),
			display_name,
			need_transform: false,
			hash,
			migrated_root_vars: Vec::new(),
		};
		// Preprocessed inlinedQrl from libs are always emitted — stripping is meant for user code without the user having to write guards; libs can put guards themselves.
		// App-level $() calls go through _create_synthetic_qsegment which has its own strip check.
		for id in &segment_data.local_idents {
			if let Some(root_id) = self.options.global_collect.root_id_for_symbol(&id.0) {
				self.ensure_export(&root_id);
			}
		}
		if self.is_inline() {
			let folded = if self.should_reg_segment(&segment_data.ctx_name) {
				ast::Expr::Call(self.create_internal_call(
					&_REG_SYMBOL,
					vec![
						folded,
						ast::Expr::Lit(ast::Lit::Str(ast::Str::from(segment_data.hash.clone()))),
					],
					true,
				))
			} else {
				folded
			};
			self.create_inline_qrl(segment_data, folded, symbol_name, span)
		} else {
			self.create_segment(segment_data, folded, symbol_name, span, 0)
		}
	}

	fn handle_qsegment(&mut self, node: ast::CallExpr) -> ast::CallExpr {
		let mut node = node;
		node.args.reverse();

		if let Some(ast::ExprOrSpread {
			expr: first_arg, ..
		}) = node.args.pop()
		{
			let custom_symbol = if let Some(ast::ExprOrSpread {
				expr: second_arg, ..
			}) = node.args.pop()
			{
				if let ast::Expr::Lit(ast::Lit::Str(second_arg)) = *second_arg {
					Some(second_arg.value)
				} else {
					None
				}
			} else {
				None
			};

			self.create_synthetic_qsegment(
				*first_arg,
				SegmentKind::Function,
				QSEGMENT.clone(),
				custom_symbol,
			)
		} else {
			node
		}
	}

	fn handle_sync_qrl(&mut self, mut node: ast::CallExpr) -> ast::CallExpr {
		if let Some(ast::ExprOrSpread {
			expr: first_arg, ..
		}) = node.args.pop()
		{
			match *first_arg {
				ast::Expr::Arrow(..) | ast::Expr::Fn(..) => {
					let serialize = render_expr(first_arg.as_ref());
					let new_callee = self.ensure_core_import(&_QRL_SYNC);
					ast::CallExpr {
						callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(
							&new_callee,
						)))),
						args: vec![
							ast::ExprOrSpread {
								spread: None,
								expr: first_arg,
							},
							// string serialized version of first argument
							ast::ExprOrSpread {
								spread: None,
								expr: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
									span: DUMMY_SP,
									value: serialize.into(),
									raw: None,
								}))),
							},
						],
						..Default::default()
					}
				}
				_ => node,
			}
		} else {
			node
		}
	}

	/// Converts inline expressions into QRLs. Returns (expr?, true) if succeeded.
	/// the second value is true if the expression is a constant
	fn create_synthetic_qqsegment(
		&mut self,
		first_arg: ast::Expr,
		accept_call_expr: bool,
	) -> (Option<ast::Expr>, bool) {
		// dbg!(first_arg.clone());
		// all variables used in the expression
		let descendent_idents = {
			let mut collector = IdentCollector::new();
			first_arg.visit_with(&mut collector);
			collector.get_words()
		};
		// dbg!(descendent_idents.clone());

		// (all scope variables, all other declartions)
		let (decl_collect, invalid_decl): (_, Vec<_>) = self
			.decl_stack
			.iter()
			.flat_map(|v| v.iter())
			.cloned()
			.partition(|(_, t)| matches!(t, IdentType::Var(_)));

		let folded = first_arg;

		let mut contains_side_effect = false;
		for ident in &descendent_idents {
			if self.options.global_collect.is_global(ident) {
				contains_side_effect = true;
			} else if invalid_decl.iter().any(|entry| entry.0 == *ident) {
				return (None, false);
			} else if decl_collect.iter().any(|entry| entry.0 == *ident) {
				continue;
			} else {
				// anything else, we can't inline
				return (None, false);
			}
		}

		let (scoped_idents, is_const) = compute_scoped_idents(&descendent_idents, &decl_collect);

		if contains_side_effect {
			return (None, scoped_idents.is_empty());
		}

		// simple variable expression, no need to inline
		if let ast::Expr::Ident(_) = folded {
			return (None, is_const);
		}

		if !is_const && (matches!(folded, ast::Expr::Call(_) | ast::Expr::Tpl(_))) {
			return (None, false);
		}

		// Handle `obj.prop` case
		if let ast::Expr::Member(member) = folded.clone() {
			let obj_expr = if let ast::Expr::Paren(paren_expr) = (*member.obj).clone() {
				// for example (obj as any).prop
				paren_expr.expr
			} else {
				member.obj
			};

			if let ast::Expr::Ident(_) = *obj_expr {
				let prop_sym = prop_to_string(&member.prop);
				if let Some(prop_sym) = prop_sym {
					let id = self.ensure_core_import(&_WRAP_PROP);
					return (Some(make_wrap(&id, obj_expr, prop_sym)), is_const);
				}
			}
		}

		let serialize_fn = self.options.is_server;
		let inlined_fn = self.ensure_core_import(&_INLINED_FN);
		convert_inlined_fn(
			folded,
			scoped_idents,
			&inlined_fn,
			accept_call_expr,
			serialize_fn,
			is_const,
		)
	}

	fn create_synthetic_qsegment(
		&mut self,
		first_arg: ast::Expr,
		ctx_kind: SegmentKind,
		ctx_name: Atom,
		custom_symbol: Option<Atom>,
	) -> ast::CallExpr {
		self._create_synthetic_qsegment(first_arg, ctx_kind, ctx_name, custom_symbol)
			.0
	}

	fn _create_synthetic_qsegment(
		&mut self,
		first_arg: ast::Expr,
		ctx_kind: SegmentKind,
		ctx_name: Atom,
		custom_symbol: Option<Atom>,
	) -> (ast::CallExpr, bool) {
		// Inline const initializer if first_arg is a simple ident referencing a local const.
		// This fixes cases like `const style = \`${css1}${css2}\`; useStyles$(style);`
		// where the segment would otherwise get an undefined identifier.
		// For Inline/Hoist strategies, skip inlining: the ident will either be accessible
		// at module scope (global), or the .s() call will be emitted inline at the use
		// site via a comma expression (non-global).
		// Skip inlining for exported identifiers: the chunk can import them from the parent
		// module, so inlining their initializer is unnecessary and may cause referenced
		// module-level variables to be incorrectly moved into the chunk.
		let first_arg = if !self.is_inline() {
			if let ast::Expr::Ident(ref ident) = first_arg {
				if !self.options.global_collect.has_export_symbol(&ident.sym) {
					if let Some(init) = self.const_initializers.get(&id!(ident)) {
						*init.clone()
					} else {
						first_arg
					}
				} else {
					first_arg
				}
			} else {
				first_arg
			}
		} else {
			first_arg
		};
		let import_qrl_name = self.get_import_qrl_name(&first_arg);

		// Library mode: inline wrapping with scope capture but no segment extraction.
		if matches!(self.options.mode, EmitMode::Lib) {
			let can_capture = can_capture_scope(&first_arg);
			let first_arg_span = first_arg.span();

			let (symbol_name, display_name, hash, _segment_hash) = self.register_context_name(
				custom_symbol,
				import_qrl_name
					.as_ref()
					.map(|info| info.display_name.as_ref()),
				import_qrl_name.as_ref().map(|info| info.hash_seed.as_ref()),
			);

			// Collect descendent idents for scope analysis
			let descendent_idents = {
				let mut collector = IdentCollector::new();
				first_arg.visit_with(&mut collector);
				collector.get_words()
			};

			let decl_collect: Vec<_> = self
				.decl_stack
				.iter()
				.flat_map(|v| v.iter())
				.filter(|(_, t)| matches!(t, IdentType::Var(_)))
				.cloned()
				.collect();

			let span = first_arg.span();
			self.segment_stack.push(symbol_name.clone());
			let folded = first_arg.fold_with(self);
			self.segment_stack.pop();

			let param_idents = get_function_params(&folded);
			let (mut scoped_idents, _is_const) =
				compute_scoped_idents(&descendent_idents, &decl_collect);
			scoped_idents.retain(|id| !param_idents.contains(id));

			if !can_capture && !scoped_idents.is_empty() {
				let ids: Vec<_> = scoped_idents.iter().map(|id| id.0.as_ref()).collect();
				self.emit_span_error_with_code(
					first_arg_span,
					&format!(
						"Qrl($) scope is not a function, but it's capturing local identifiers: {}",
						ids.join(", ")
					),
					errors::get_diagnostic_code(errors::DiagnosticRule::CanNotCapture),
				);
				scoped_idents = vec![];
			}

			// Inject _captures destructuring if there are captured variables
			let folded = if !scoped_idents.is_empty() {
				let new_local = self.ensure_core_import(&_CAPTURES);
				transform_function_expr(folded, &new_local, &scoped_idents)
			} else {
				folded
			};

			let captures = Captures::Auto(scoped_idents.clone());
			let segment_data = SegmentData {
				extension: self.options.extension.clone(),
				local_idents: vec![],
				scoped_idents,
				captures,
				parent_segment: self.segment_stack.last().cloned(),
				ctx_kind,
				ctx_name,
				origin: self.options.path_data.rel_path.to_slash_lossy().into(),
				path: self.options.path_data.rel_dir.to_slash_lossy().into(),
				display_name,
				need_transform: false,
				hash,
				migrated_root_vars: Vec::new(),
			};

			return (
				self.create_inline_qrl(segment_data, folded, symbol_name, span),
				false,
			);
		}

		let can_capture = can_capture_scope(&first_arg);
		let first_arg_span = first_arg.span();

		let (symbol_name, display_name, hash, segment_hash) = self.register_context_name(
			custom_symbol,
			import_qrl_name
				.as_ref()
				.map(|info| info.display_name.as_ref()),
			import_qrl_name.as_ref().map(|info| info.hash_seed.as_ref()),
		);

		// Collect descendent idents
		let descendent_idents = {
			let mut collector = IdentCollector::new();
			first_arg.visit_with(&mut collector);
			collector.get_words()
		};

		let (decl_collect, invalid_decl): (_, Vec<_>) = self
			.decl_stack
			.iter()
			.flat_map(|v| v.iter())
			.cloned()
			.partition(|(_, t)| matches!(t, IdentType::Var(_)));

		self.segment_stack.push(symbol_name.clone());
		let span = first_arg.span();
		let folded = first_arg.fold_with(self);
		self.segment_stack.pop();

		// Collect local idents
		let local_idents = self.get_local_idents(&folded);

		// Get function parameters to exclude from captured scope
		let param_idents = get_function_params(&folded);

		let (mut scoped_idents, is_const) =
			compute_scoped_idents(&descendent_idents, &decl_collect);

		// Filter out function parameters from scoped_idents
		// Parameters don't need to be captured via _captures
		scoped_idents.retain(|id| !param_idents.contains(id));

		if !can_capture && !scoped_idents.is_empty() {
			let ids: Vec<_> = scoped_idents.iter().map(|id| id.0.as_ref()).collect();
			self.emit_span_error_with_code(
				first_arg_span,
				&format!(
					"Qrl($) scope is not a function, but it's capturing local identifiers: {}",
					ids.join(", ")
				),
				errors::get_diagnostic_code(errors::DiagnosticRule::CanNotCapture),
			);
			scoped_idents = vec![];
		}
		let captures = Captures::Auto(scoped_idents.clone());
		let segment_data = SegmentData {
			extension: self.options.extension.clone(),
			local_idents,
			scoped_idents,
			captures,
			parent_segment: self.segment_stack.last().cloned(),
			ctx_kind,
			ctx_name,
			origin: self.options.path_data.rel_path.to_slash_lossy().into(),
			path: self.options.path_data.rel_dir.to_slash_lossy().into(),
			display_name,
			need_transform: true,
			hash,
			migrated_root_vars: Vec::new(),
		};
		let should_emit = self.should_emit_segment(&segment_data);
		if should_emit {
			for id in &segment_data.local_idents {
				if !self.options.global_collect.has_export_symbol(&id.0) {
					if let Some(root_id) = self.options.global_collect.root_id_for_symbol(&id.0) {
						self.ensure_export(&root_id);
					}
					if invalid_decl.iter().any(|entry| entry.0 == *id) {
						self.emit_error_with_code(
							first_arg_span,
							&format!(
								"Reference to identifier '{}' can not be used inside a Qrl($) scope because it's a function",
								id.0
							),
							errors::get_diagnostic_code(errors::DiagnosticRule::FunctionReference),
						);
					}
				}
			}
		}
		if !should_emit {
			(self.create_noop_qrl(&symbol_name, segment_data), is_const)
		} else if self.is_inline() {
			let folded = if !segment_data.scoped_idents.is_empty() {
				let new_local = self.ensure_core_import(&_CAPTURES);
				transform_function_expr(folded, &new_local, &segment_data.scoped_idents)
			} else {
				folded
			};
			let folded = if self.should_reg_segment(&segment_data.ctx_name) {
				ast::Expr::Call(self.create_internal_call(
					&_REG_SYMBOL,
					vec![
						folded,
						ast::Expr::Lit(ast::Lit::Str(ast::Str::from(segment_data.hash.clone()))),
					],
					true,
				))
			} else {
				folded
			};
			(
				self.create_inline_qrl(segment_data, folded, symbol_name, span),
				is_const,
			)
		} else {
			(
				self.create_segment(segment_data, folded, symbol_name, span, segment_hash),
				is_const,
			)
		}
	}

	fn get_local_idents(&self, expr: &ast::Expr) -> Vec<Id> {
		let mut collector = IdentCollector::new();
		expr.visit_with(&mut collector);

		let use_h = collector.use_h;
		let use_fragment = collector.use_fragment;

		// Collect identifiers declared locally within this expression
		// This prevents shadowed names (like currentScrollState in spa-init.ts)
		// from being treated as external dependencies
		let mut locally_declared = HashSet::new();
		collect_local_declarations_from_expr(expr, &mut locally_declared);

		let mut idents = collector.get_words();
		// Filter out locally-declared identifiers
		idents.retain(|id| !locally_declared.contains(id));

		if use_h {
			if let Some(id) = &self.h_fn {
				idents.push(id.clone());
			}
		}
		if use_fragment {
			if let Some(id) = &self.fragment_fn {
				idents.push(id.clone());
			}
		}
		idents
	}

	/// Removes `expr` from the AST and moves it to a separate import.
	/// These import are then grouped into entry files depending on strategy, which is used to
	/// determine the chunks for bundling.
	fn create_segment(
		&mut self,
		segment_data: SegmentData,
		expr: ast::Expr,
		symbol_name: Atom,
		span: Span,
		segment_hash: u64,
	) -> ast::CallExpr {
		let canonical_filename = get_canonical_filename(&segment_data.display_name, &symbol_name);
		let param_names = Self::extract_param_names(&expr);

		// We import from the segment file directly but store the entry for later chunking by the bundler
		let entry = self
			.options
			.entry_policy
			.get_entry_for_sym(&self.stack_ctxt, &segment_data);

		let mut import_path = ["./", &canonical_filename].concat();
		if self.options.explicit_extensions {
			import_path.push('.');
			import_path.push_str(&self.options.extension);
		}
		let import_expr = self.create_qrl(import_path.into(), &symbol_name, &segment_data, &span);
		self.segments.push(Segment {
			entry,
			span,
			canonical_filename,
			name: symbol_name,
			data: segment_data,
			expr: Box::new(expr),
			hash: segment_hash,
			param_names,
			qrl_id: None,
		});
		import_expr
	}

	// transforms `jsx(type, props, key)` into the internal versions
	// the jsx transform already converted `<div>` into `jsx('div', {}, key)`
	fn handle_jsx(&mut self, mut node: ast::CallExpr) -> ast::CallExpr {
		// if the props aren't an object literal, leave unchanged
		match &*node.args[1].expr {
			ast::Expr::Object(_) => {}
			_ => return node,
		}
		let node_type = node.args.remove(0);
		let node_props = node.args.remove(0);

		let (name_token, is_fn, is_text_only) = match &*node_type.expr {
			ast::Expr::Lit(ast::Lit::Str(str)) => {
				self.stack_ctxt.push(str.value.to_string());
				(true, false, is_text_only(&str.value))
			}
			ast::Expr::Ident(ident) => {
				self.stack_ctxt.push(ident.sym.to_string());
				if !self.immutable_function_cmp.contains(&id!(ident)) {
					self.jsx_mutable = true;
				}
				(true, true, false)
			}
			_ => {
				self.jsx_mutable = true;
				(false, true, false)
			}
		};
		let should_emit_key = is_fn || self.root_jsx_mode;
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = false;

		let (should_sort, var_props, const_props, children, flags) =
			self.handle_jsx_props_obj(node_props, is_fn, is_text_only);

		let key = if node.args.len() == 1 {
			node.args.remove(0)
		} else if should_emit_key {
			let new_key = format!("{}_{}", &base64(self.file_hash)[0..2], self.jsx_key_counter);
			self.jsx_key_counter += 1;
			ast::ExprOrSpread {
				spread: None,
				expr: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
					span: DUMMY_SP,
					value: new_key.into(),
					raw: None,
				}))),
			}
		} else {
			get_null_arg()
		};

		// TODO use _restProps or similar to remove const props from spread props
		let (jsx_func, mut args) = if should_sort {
			(
				self.ensure_core_import(&_JSX_SPLIT),
				vec![node_type, var_props, const_props, children, flags, key],
			)
		} else {
			(
				self.ensure_core_import(&_JSX_SORTED),
				vec![node_type, var_props, const_props, children, flags, key],
			)
		};
		if matches!(self.options.mode, EmitMode::Dev | EmitMode::Hmr) {
			args.push(self.get_dev_location(node.span));
		}

		if name_token {
			self.stack_ctxt.pop();
		}
		self.root_jsx_mode = prev;
		ast::CallExpr {
			callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(&jsx_func)))),
			args,
			..node
		}
	}

	fn handle_jsx_value(
		&mut self,
		ctx_name: Atom,
		value: Option<ast::JSXAttrValue>,
	) -> Option<ast::JSXAttrValue> {
		if let Some(ast::JSXAttrValue::JSXExprContainer(container)) = value {
			if let ast::JSXExpr::Expr(expr) = container.expr {
				let is_fn = matches!(*expr, ast::Expr::Arrow(_) | ast::Expr::Fn(_));
				if is_fn {
					// Determine segment kind: EventHandler for event props, JSXProp otherwise
					let segment_kind = if jsx_event_to_html_attribute(&ctx_name, false).is_some() {
						SegmentKind::EventHandler
					} else {
						SegmentKind::JSXProp
					};
					let qrl = self.create_synthetic_qsegment(*expr, segment_kind, ctx_name, None);
					let hoisted = self.hoist_qrl_to_module_scope(qrl);
					Some(ast::JSXAttrValue::JSXExprContainer(ast::JSXExprContainer {
						span: DUMMY_SP,
						expr: ast::JSXExpr::Expr(Box::new(hoisted)),
					}))
				} else {
					Some(ast::JSXAttrValue::JSXExprContainer(ast::JSXExprContainer {
						span: DUMMY_SP,
						expr: ast::JSXExpr::Expr(expr),
					}))
				}
			} else {
				Some(ast::JSXAttrValue::JSXExprContainer(container))
			}
		} else {
			value
		}
	}

	pub fn ensure_import(&mut self, new_specifier: &Atom, source: &Atom) -> Id {
		self.options.global_collect.import(new_specifier, source)
	}

	pub fn ensure_core_import(&mut self, new_specifier: &Atom) -> Id {
		self.options
			.global_collect
			.import(new_specifier, &self.options.core_module)
	}

	fn ensure_export(&mut self, id: &Id) {
		let canonical_id = self.options.global_collect.canonical_id_for(id);
		let exported_name: Option<Atom> = Some(format!("_auto_{}", canonical_id.0).into());
		if self
			.options
			.global_collect
			.add_export(canonical_id.clone(), exported_name.clone())
		{
			self.extra_bottom_items.insert(
				canonical_id.clone(),
				create_synthetic_named_export(&canonical_id, exported_name),
			);
		}
	}

	/// Pre-compute captures for an event handler expression without folding it.
	/// Returns the set of captured identifiers (variables from enclosing scope).
	fn compute_handler_captures(&self, handler: &ast::Expr) -> Vec<Id> {
		let descendent_idents = {
			let mut collector = IdentCollector::new();
			handler.visit_with(&mut collector);
			collector.get_words()
		};

		let (decl_collect, _): (Vec<_>, Vec<_>) = self
			.decl_stack
			.iter()
			.flat_map(|v| v.iter())
			.cloned()
			.partition(|(_, t)| matches!(t, IdentType::Var(_)));

		let (mut scoped, _) = compute_scoped_idents(&descendent_idents, &decl_collect);

		let params = get_function_params(handler);
		scoped.retain(|id| !params.contains(id));

		scoped
	}

	/// Chooses which hoisting scope (0 = root component, 1 = first callback or nested component, …)
	/// should receive a QRL's const declaration. Uses the segment just pushed in create_segment (segments.last()).
	///
	/// No captures: hoist one level up (current_depth - 1) so we get one QRL per handler type
	/// without crossing component boundaries (nested component$ must keep its QRLs in its own scope).
	///
	/// Has captures: emit the QRL in the highest (outermost) scope where all captures are
	/// still in scope. We find min_decl_scope and the smallest hoisting scope j that contains it.
	/// When the segment has scoped_idents they are passed as qrl(..., [captures]); the captured
	/// vars must be in scope at the QRL declaration site, so we use j only. When scoped_idents
	/// is empty (captures only via q:p), hoist to the current component's top (depth 0 for root).
	fn compute_hoist_target_depth(&self, current_depth: usize) -> usize {
		self.segments
			.last()
			.map(|s| &s.data.scoped_idents)
			.and_then(|scoped_idents| {
				if scoped_idents.is_empty() {
					// No capture array — hoist to current component's top (e.g. root = 0)
					let current_component_depth = self
						.component_depths
						.iter()
						.rev()
						.find(|&&d| d <= current_depth)
						.copied()
						.unwrap_or(0);
					Some(current_component_depth)
				} else {
					let min_decl_scope = (0..self.decl_stack.len()).find(|&i| {
						scoped_idents.iter().all(|capture| {
							let name = capture.0.as_ref();
							self.decl_stack[0..=i]
								.iter()
								.any(|scope| scope.iter().any(|(id, _)| id.0.as_ref() == name))
						})
					})?;
					// Smallest j = outermost scope whose body contains min_decl_scope
					let j = self
						.hoisting_scope_decl_indices
						.iter()
						.enumerate()
						.find(|(_, &decl_idx)| decl_idx >= min_decl_scope.saturating_sub(1))
						.map(|(idx, _)| idx)?;
					let target = j.min(current_depth);
					// scoped_idents non-empty => capture array in qrl(..., [captures]) => must be in scope
					let has_capture_array = !scoped_idents.is_empty();
					if has_capture_array {
						Some(target)
					} else {
						let current_component_depth = self
							.component_depths
							.iter()
							.rev()
							.find(|&&d| d <= current_depth)
							.copied()
							.unwrap_or(0);
						Some(target.min(current_component_depth))
					}
				}
			})
			.unwrap_or(current_depth)
	}

	/// Hoist QRL creation to module scope. The QRL itself (without captures) is always hoisted
	/// to module scope. If captures exist, a `.w([...])` call is returned ("with captures").
	/// When inside a loop, the `w` call is further hoisted to the highest scope
	/// where all captures are available, for efficiency.
	fn hoist_qrl_if_needed(&mut self, converted_expr: ast::CallExpr, is_fn: bool) -> ast::Expr {
		let module_hoisted = self.hoist_qrl_to_module_scope(converted_expr);

		// If it's just an ident (no captures), no further hoisting needed
		let with_captures_call = match module_hoisted {
			ast::Expr::Call(call_expr) => call_expr,
			expr => return expr,
		};

		// Hoist w calls when inside a loop (for, while, .map(), etc.)
		// This creates a single declaration outside the loop for efficiency.
		// Don't hoist component$ QRLs (is_fn = true).
		let should_hoist =
			!self.iteration_var_stack.is_empty() && !is_fn && !self.hoisted_qrls.is_empty();

		if should_hoist {
			// Extract symbol name from the hoisted ident used as the receiver.
			// The module-scope const is named `q_<symbol>`, so strip the prefix
			// to avoid shadowing it.
			let symbol_name = if let ast::Callee::Expr(box ast::Expr::Member(ref member)) =
				with_captures_call.callee
			{
				if let ast::Expr::Ident(ref ident) = *member.obj {
					ident
						.sym
						.strip_prefix("q_")
						.unwrap_or(&ident.sym)
						.to_string()
				} else {
					format!("qrl_{}", with_captures_call.span.lo.0)
				}
			} else {
				format!("qrl_{}", with_captures_call.span.lo.0)
			};

			let current_depth = self.hoisted_qrls.len() - 1;
			let target_depth = self.compute_hoist_target_depth(current_depth);

			// Check if we already hoisted this w call at target depth
			let existing_var = self.hoisted_qrls[target_depth]
				.iter()
				.find_map(|(name, _)| {
					if name == &symbol_name {
						Some(ast::Expr::Ident(ast::Ident::new(
							Atom::from(name.clone()),
							DUMMY_SP,
							SyntaxContext::empty(),
						)))
					} else {
						None
					}
				});

			if let Some(existing_ident) = existing_var {
				existing_ident
			} else {
				let var_declarator = ast::VarDeclarator {
					span: DUMMY_SP,
					name: ast::Pat::Ident(ast::BindingIdent {
						id: ast::Ident::new(
							Atom::from(symbol_name.clone()),
							DUMMY_SP,
							SyntaxContext::empty(),
						),
						type_ann: None,
					}),
					init: Some(Box::new(ast::Expr::Call(with_captures_call))),
					definite: false,
				};

				self.hoisted_qrls[target_depth].push((symbol_name.clone(), var_declarator));

				ast::Expr::Ident(ast::Ident::new(
					Atom::from(symbol_name),
					DUMMY_SP,
					SyntaxContext::empty(),
				))
			}
		} else {
			ast::Expr::Call(with_captures_call)
		}
	}

	fn hoist_qrl_to_module_scope(&mut self, call_expr: ast::CallExpr) -> ast::Expr {
		// Library mode: don't hoist QRLs to module scope
		if matches!(self.options.mode, EmitMode::Lib) {
			return ast::Expr::Call(call_expr);
		}
		let mut call_expr = call_expr;
		let is_inlined = self.is_inlined_qrl_callee(&call_expr);

		// Extract and remove capture array from the QRL call args (if present)
		let capture_array = {
			let pos = call_expr
				.args
				.iter()
				.position(|arg| matches!(&*arg.expr, ast::Expr::Array(_)));
			pos.map(|i| {
				if let ast::Expr::Array(arr) = *call_expr.args.remove(i).expr {
					arr
				} else {
					unreachable!()
				}
			})
		};

		if let Some(is_dev) = is_inlined {
			// For inlinedQrl: convert to noopQrl + $ref$ assignment
			// Args layout: [fn_body, symbol_name_str, optional_dev_info]
			let fn_body_expr = *call_expr.args.remove(0).expr;

			// Remaining args: [symbol_name_str, optional_dev_info] — exactly what noopQrl needs
			let symbol_name = call_expr
				.args
				.first()
				.and_then(|arg| match &*arg.expr {
					ast::Expr::Lit(ast::Lit::Str(s)) => Some(s.value.to_string()),
					_ => None,
				})
				.unwrap_or_else(|| format!("qrl_{}", call_expr.span.lo.0));

			let noop_fn: &Atom = if is_dev { &_NOOP_QRL_DEV } else { &_NOOP_QRL };
			let noop_local = self.ensure_core_import(noop_fn);

			// Build noopQrl call with remaining args
			let noop_call = {
				let span = if let Some(comments) = self.options.comments {
					let span = Span::dummy_with_cmt();
					comments.add_pure_comment(span.lo);
					span
				} else {
					DUMMY_SP
				};
				ast::CallExpr {
					callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(
						&noop_local,
					)))),
					span,
					args: call_expr
						.args
						.into_iter()
						.map(|arg| ast::ExprOrSpread {
							spread: None,
							expr: arg.expr,
						})
						.collect(),
					..Default::default()
				}
			};

			let ident_name = Atom::from(format!("q_{}", symbol_name));
			let id: Id = (ident_name, SyntaxContext::empty());

			if !self.extra_top_items.contains_key(&id) {
				let declarator = ast::VarDeclarator {
					span: DUMMY_SP,
					name: ast::Pat::Ident(ast::BindingIdent::from(new_ident_from_id(&id))),
					init: Some(Box::new(ast::Expr::Call(noop_call))),
					definite: false,
				};
				self.extra_top_items.insert(
					id.clone(),
					ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(Box::new(
						ast::VarDecl {
							span: DUMMY_SP,
							kind: ast::VarDeclKind::Const,
							declare: false,
							ctxt: SyntaxContext::empty(),
							decls: vec![declarator],
						},
					)))),
				);
			}

			// Add setRef call: q_name.s(fn_body)
			// For Hoist strategy segment idents, the .s() call is emitted by the
			// drain code right after the const definition to prevent bundler reordering.
			let is_hoisted_segment = if let ast::Expr::Ident(ref ident) = fn_body_expr {
				self.hoisted_segment_idents.contains(&id!(ident))
			} else {
				false
			};
			// Check if fn_body_expr is a non-global ident (not accessible at module scope).
			// For such idents, we can't put .s() in ref_assignments (module scope);
			// instead we emit it inline via a comma expression: (q_X.s(value), q_X)
			let is_non_global_ident = matches!(&fn_body_expr, ast::Expr::Ident(ident)
				if !self.options.global_collect.is_global(&id!(ident)));
			if !is_hoisted_segment && !is_non_global_ident {
				self.ref_assignments
					.push(Self::create_ref_assignment(&id, fn_body_expr.clone()));
			}

			let hoisted_ident = ast::Expr::Ident(new_ident_from_id(&id));

			// Build the result expression, optionally with inline .s() and/or .w()
			let result = if is_non_global_ident && !is_hoisted_segment {
				// Emit .s() inline: (q_X.s(value), q_X) or (q_X.s(value), q_X).w([...])
				let set_ref_call = ast::Expr::Call(ast::CallExpr {
					callee: ast::Callee::Expr(Box::new(ast::Expr::Member(ast::MemberExpr {
						obj: Box::new(hoisted_ident.clone()),
						prop: ast::MemberProp::Ident(ast::IdentName::new("s".into(), DUMMY_SP)),
						span: DUMMY_SP,
					}))),
					args: vec![ast::ExprOrSpread {
						spread: None,
						expr: Box::new(fn_body_expr),
					}],
					..Default::default()
				});
				ast::Expr::Seq(ast::SeqExpr {
					span: DUMMY_SP,
					exprs: vec![Box::new(set_ref_call), Box::new(hoisted_ident)],
				})
			} else {
				hoisted_ident
			};

			if let Some(captures) = capture_array {
				ast::Expr::Call(ast::CallExpr {
					callee: ast::Callee::Expr(Box::new(ast::Expr::Member(ast::MemberExpr {
						obj: Box::new(result),
						prop: ast::MemberProp::Ident(ast::IdentName::new("w".into(), DUMMY_SP)),
						span: DUMMY_SP,
					}))),
					args: vec![ast::ExprOrSpread {
						spread: None,
						expr: Box::new(ast::Expr::Array(captures)),
					}],
					..Default::default()
				})
			} else {
				result
			}
		} else {
			// For qrl() calls: existing behavior
			if let Some(comments) = self.options.comments {
				let span = Span::dummy_with_cmt();
				comments.add_pure_comment(span.lo);
				call_expr.span = span;
			}

			let symbol_name = call_expr
				.args
				.get(1)
				.and_then(|arg| match &*arg.expr {
					ast::Expr::Lit(ast::Lit::Str(s)) => Some(s.value.to_string()),
					_ => None,
				})
				.unwrap_or_else(|| format!("qrl_{}", call_expr.span.lo.0));
			let ident_name = Atom::from(format!("q_{}", symbol_name));
			let id: Id = (ident_name, SyntaxContext::empty());

			if !self.extra_top_items.contains_key(&id) {
				let declarator = ast::VarDeclarator {
					span: DUMMY_SP,
					name: ast::Pat::Ident(ast::BindingIdent::from(new_ident_from_id(&id))),
					init: Some(Box::new(ast::Expr::Call(call_expr))),
					definite: false,
				};
				self.extra_top_items.insert(
					id.clone(),
					ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(Box::new(
						ast::VarDecl {
							span: DUMMY_SP,
							kind: ast::VarDeclKind::Const,
							declare: false,
							ctxt: SyntaxContext::empty(),
							decls: vec![declarator],
						},
					)))),
				);
			}

			let hoisted_ident = ast::Expr::Ident(new_ident_from_id(&id));

			if let Some(captures) = capture_array {
				ast::Expr::Call(ast::CallExpr {
					callee: ast::Callee::Expr(Box::new(ast::Expr::Member(ast::MemberExpr {
						obj: Box::new(hoisted_ident),
						prop: ast::MemberProp::Ident(ast::IdentName::new("w".into(), DUMMY_SP)),
						span: DUMMY_SP,
					}))),
					args: vec![ast::ExprOrSpread {
						spread: None,
						expr: Box::new(ast::Expr::Array(captures)),
					}],
					..Default::default()
				})
			} else {
				hoisted_ident
			}
		}
	}

	/// Helper function to merge an event handler with an existing one in the props list.
	/// If a handler with the same key already exists, they are merged into an array.
	/// Otherwise, the new handler is simply added.
	fn merge_or_add_event_handler(
		&mut self,
		props: &mut Vec<ast::PropOrSpread>,
		key: Atom,
		new_handler: Box<ast::Expr>,
	) {
		// Check if there's already a handler with this key
		let existing_handler_index = props.iter().position(|prop| {
			if let ast::PropOrSpread::Prop(box ast::Prop::KeyValue(kv)) = prop {
				if let ast::PropName::Str(s) = &kv.key {
					return s.value == key;
				}
			}
			false
		});

		if let Some(index) = existing_handler_index {
			// Merge handlers into an array
			let existing_prop = props.remove(index);
			if let ast::PropOrSpread::Prop(box ast::Prop::KeyValue(existing_kv)) = existing_prop {
				let merged_handler =
					if let ast::Expr::Array(mut existing_array) = *existing_kv.value {
						// Existing handler is already an array, append to it
						existing_array.elems.push(Some(ast::ExprOrSpread {
							spread: None,
							expr: new_handler.fold_with(self),
						}));
						ast::Expr::Array(existing_array)
					} else {
						// Create new array with both handlers
						ast::Expr::Array(ast::ArrayLit {
							span: DUMMY_SP,
							elems: vec![
								Some(ast::ExprOrSpread {
									spread: None,
									expr: existing_kv.value,
								}),
								Some(ast::ExprOrSpread {
									spread: None,
									expr: new_handler.fold_with(self),
								}),
							],
						})
					};

				let merged_prop =
					ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
						key: ast::PropName::Str(ast::Str {
							span: DUMMY_SP,
							value: key,
							raw: None,
						}),
						value: Box::new(merged_handler),
					})));
				props.push(merged_prop);
			}
		} else {
			// Add the new handler
			let handler_prop =
				ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
					key: ast::PropName::Str(ast::Str {
						span: DUMMY_SP,
						value: key,
						raw: None,
					}),
					value: new_handler,
				})));
			props.push(handler_prop.fold_with(self));
		}
	}

	/// Handles transformation of JSX props for native elements:
	/// - Transform event props (e.g., onClick$ -> q-e:click)
	/// - Transform className -> class
	/// - Handle bind:value and bind:checked (always for constProps, only for _jsxSorted in varProps)
	fn transform_jsx_prop(
		&mut self,
		original_key_word: &Option<Atom>,
		node: &ast::KeyValueProp,
		maybe_const_props: &mut Vec<ast::PropOrSpread>,
		context: TransformJsxPropContext<'_>,
	) -> (Option<Atom>, Option<Atom>, bool) {
		let mut key_word = original_key_word.clone();
		let mut transformed_event_key = None;

		// Only for native elements, not components
		if !context.is_fn {
			if let Some(ref kw) = original_key_word {
				if kw.as_ref().starts_with("passive:") {
					return (key_word, transformed_event_key, true);
				}
				if kw.as_ref().starts_with("preventdefault:") {
					let event = kw.as_ref().strip_prefix("preventdefault:").unwrap();
					if context.passive_events.contains(event) {
						self.emit_span_warning_with_code(
							node.key.span(),
							&format!(
								"preventdefault:{event} has no effect when passive:{event} is also set; passive event listeners cannot call preventDefault()"
							),
							errors::get_diagnostic_code(
								errors::DiagnosticRule::PreventdefaultPassiveCheck,
							),
						);
						return (key_word, transformed_event_key, true);
					}
				}

				// Transform event props (e.g., onClick$ -> q-e:click)
				let is_passive = jsx_event_to_event_name(kw.as_ref())
					.is_some_and(|event_name| context.passive_events.contains(&event_name));
				if let Some(html_attr) = jsx_event_to_html_attribute(kw.as_ref(), is_passive) {
					transformed_event_key = Some(html_attr.clone());
					key_word = Some(html_attr);
				}

				if kw == &*CLASS_NAME {
					key_word = Some(CLASS.clone());
					transformed_event_key = Some(CLASS.clone());
				}

				// Handle bind:value and bind:checked:
				// - Always transform when targeting constProps (compile-time known)
				// - Only transform for _jsxSorted (should_sort = false) when targeting varProps
				// - For _jsxSplit, leave bind:* untouched (runtime handles it)
				if context.should_sort && Self::is_bind_prop(kw) {
					return (key_word, transformed_event_key, false);
				}
			}
			if context.is_target_const_props || !context.should_sort {
				if let Some(ref kw) = original_key_word {
					if Self::is_bind_prop(kw) {
						let is_checked = kw == &*BIND_CHECKED;
						let value_key = if is_checked {
							CHECKED.clone()
						} else {
							VALUE.clone()
						};
						let handler_fn_name = if is_checked { "_chk" } else { "_val" };

						// Ensure _chk or _val is imported
						let handler_id =
							self.ensure_core_import(if is_checked { &_CHK } else { &_VAL });
						let inlined_qrl_id = self.ensure_core_import(&_INLINED_QRL);

						// Add the value/checked prop
						let value_prop = ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(
							ast::KeyValueProp {
								key: ast::PropName::Str(ast::Str {
									span: DUMMY_SP,
									value: value_key,
									raw: None,
								}),
								value: node.value.clone(),
							},
						)));
						maybe_const_props.push(value_prop.fold_with(self));

						// Create QRL for the handler: inlinedQrl(_chk, '_chk', [signal])
						let handler_qrl = ast::Expr::Call(ast::CallExpr {
							callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(
								new_ident_from_id(&inlined_qrl_id),
							))),
							args: vec![
								ast::ExprOrSpread {
									spread: None,
									expr: Box::new(ast::Expr::Ident(new_ident_from_id(
										&handler_id,
									))),
								},
								ast::ExprOrSpread {
									spread: None,
									expr: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
										span: DUMMY_SP,
										value: Atom::from(handler_fn_name),
										raw: None,
									}))),
								},
								ast::ExprOrSpread {
									spread: None,
									expr: Box::new(ast::Expr::Array(ast::ArrayLit {
										span: DUMMY_SP,
										elems: vec![Some(ast::ExprOrSpread {
											spread: None,
											expr: node.value.clone(),
										})],
									})),
								},
							],
							..Default::default()
						});

						// Use helper function to merge or add the q-e:input handler
						self.merge_or_add_event_handler(
							maybe_const_props,
							ON_INPUT.clone(),
							Box::new(handler_qrl),
						);

						// Skip the bind: prop itself - signal to continue the loop
						return (key_word, transformed_event_key, true);
					}
				}
			}
		}

		(key_word, transformed_event_key, false)
	}

	fn is_bind_prop(key: &Atom) -> bool {
		key == &*BIND_VALUE || key == &*BIND_CHECKED
	}

	/// Checks if a component has bind:* directive props.
	/// Components with bind directives need _jsxSplit for runtime handling.
	fn component_has_bind_props(props: &[ast::PropOrSpread]) -> bool {
		props.iter().any(|prop| {
			if let ast::PropOrSpread::Prop(box ast::Prop::KeyValue(ref node)) = prop {
				match &node.key {
					ast::PropName::Ident(ref ident) => Self::is_bind_prop(&ident.sym),
					ast::PropName::Str(ref s) => Self::is_bind_prop(&s.value),
					_ => false,
				}
			} else {
				false
			}
		})
	}

	fn create_qrl(
		&mut self,
		path: Atom,
		symbol: &str,
		segment_data: &SegmentData,
		span: &Span,
	) -> ast::CallExpr {
		let import_fn = ast::Expr::Arrow(ast::ArrowExpr {
			body: Box::new(ast::BlockStmtOrExpr::Expr(Box::new(ast::Expr::Call(
				ast::CallExpr {
					callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(ast::Ident::new(
						atom!("import"),
						DUMMY_SP,
						Default::default(),
					)))),
					args: vec![ast::ExprOrSpread {
						spread: None,
						expr: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
							span: DUMMY_SP,
							value: path.clone(),
							raw: None,
						}))),
					}],
					..Default::default()
				},
			)))),
			..Default::default()
		});

		// The qrl() call is always hoisted to module scope, so we can inline the import arrow.
		let mut args = Vec::new();
		let is_worker_qrl = segment_data.ctx_name == *QWORKER;
		if is_worker_qrl {
			args.push(ast::Expr::Lit(ast::Lit::Str(ast::Str {
				span: DUMMY_SP,
				value: format!("{}{}", WORKER_QRL_CHUNK_SENTINEL, path).into(),
				raw: None,
			})));
		}
		args.push(import_fn);
		args.push(ast::Expr::Lit(ast::Lit::Str(ast::Str {
			span: DUMMY_SP,
			value: symbol.into(),
			raw: None,
		})));
		let fn_callee = if matches!(self.options.mode, EmitMode::Dev | EmitMode::Hmr) {
			args.push(get_qrl_dev_obj(
				Atom::from(
					self.options
						.dev_path
						.unwrap_or(&self.options.path_data.abs_path.to_slash_lossy()),
				),
				segment_data,
				span,
			));
			if is_worker_qrl {
				_QRL_WITH_CHUNK_DEV.clone()
			} else {
				_QRL_DEV.clone()
			}
		} else {
			if is_worker_qrl {
				_QRL_WITH_CHUNK.clone()
			} else {
				_QRL.clone()
			}
		};

		self.emit_captures(&segment_data.captures, &mut args);
		self.create_internal_call(&fn_callee, args, true)
	}

	fn create_inline_qrl(
		&mut self,
		segment_data: SegmentData,
		expr: ast::Expr,
		symbol_name: Atom,
		span: Span,
	) -> ast::CallExpr {
		let should_inline = matches!(self.options.entry_strategy, EntryStrategy::Inline)
			|| matches!(self.options.mode, EmitMode::Lib)
			|| matches!(expr, ast::Expr::Ident(_));
		let param_names = Self::extract_param_names(&expr);
		let inlined_expr = if should_inline {
			// For Ident/Null: pass through as-is (keeps separate const)
			// For other expressions: pass through directly — hoist_qrl_to_module_scope
			// will inline it into the $ref$ assignment
			expr
		} else {
			let new_ident = private_ident!(symbol_name.clone());
			let qrl_id: Id = (
				Atom::from(format!("q_{}", symbol_name)),
				SyntaxContext::empty(),
			);
			self.hoisted_segment_idents.insert(id!(new_ident));
			self.segments.push(Segment {
				entry: None,
				span,
				canonical_filename: get_canonical_filename(
					&segment_data.display_name,
					&symbol_name,
				),
				name: symbol_name.clone(),
				data: segment_data.clone(),
				expr: Box::new(expr),
				hash: new_ident.ctxt.as_u32() as u64,
				param_names,
				qrl_id: Some(qrl_id),
			});
			ast::Expr::Ident(new_ident)
		};

		let mut args = vec![
			inlined_expr,
			ast::Expr::Lit(ast::Lit::Str(ast::Str {
				span: DUMMY_SP,
				value: symbol_name,
				raw: None,
			})),
		];

		let fn_callee = if matches!(self.options.mode, EmitMode::Dev | EmitMode::Hmr) {
			args.push(get_qrl_dev_obj(
				Atom::from(
					self.options
						.dev_path
						.unwrap_or(&self.options.path_data.abs_path.to_slash_lossy()),
				),
				&segment_data,
				&span,
			));
			_INLINED_QRL_DEV.clone()
		} else {
			_INLINED_QRL.clone()
		};

		self.emit_captures(&segment_data.captures, &mut args);
		self.create_internal_call(&fn_callee, args, true)
	}

	fn emit_captures(&self, captures: &Captures, args: &mut Vec<ast::Expr>) {
		match captures {
			Captures::Explicit(arr) => args.push(ast::Expr::Array(arr.clone())),
			Captures::Auto(ids) if !ids.is_empty() => args.push(ast::Expr::Array(ast::ArrayLit {
				span: DUMMY_SP,
				elems: ids
					.iter()
					.map(|id| {
						Some(ast::ExprOrSpread {
							spread: None,
							expr: Box::new(ast::Expr::Ident(new_ident_from_id(id))),
						})
					})
					.collect(),
			})),
			_ => {}
		}
	}

	pub fn create_internal_call(
		&mut self,
		fn_name: &Atom,
		exprs: Vec<ast::Expr>,
		pure: bool,
	) -> ast::CallExpr {
		let local = self.ensure_core_import(fn_name);
		let span = if pure {
			if let Some(comments) = self.options.comments {
				let span = Span::dummy_with_cmt();
				comments.add_pure_comment(span.lo);
				span
			} else {
				DUMMY_SP
			}
		} else {
			DUMMY_SP
		};
		ast::CallExpr {
			callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(&local)))),
			span,
			args: exprs
				.into_iter()
				.map(|expr| ast::ExprOrSpread {
					spread: None,
					expr: Box::new(expr),
				})
				.collect(),
			..Default::default()
		}
	}

	/// This transforms the props of a `jsx(type, {...props}, key)` call, forwarding signals and
	/// splitting into const and var props
	fn handle_jsx_props_obj(
		&mut self,
		expr: ast::ExprOrSpread,
		is_fn: bool,
		is_text_only: bool,
	) -> (
		bool,
		ast::ExprOrSpread,
		ast::ExprOrSpread,
		ast::ExprOrSpread,
		ast::ExprOrSpread,
	) {
		let (should_sort, var_props_raw, const_props_raw, children, flags) =
			self.internal_handle_jsx_props_obj(expr, is_fn, is_text_only);

		let var_props = if var_props_raw.is_empty() {
			get_null_arg()
		} else {
			self.jsx_mutable = true;
			ast::ExprOrSpread {
				spread: None,
				expr: Box::new(ast::Expr::Object(ast::ObjectLit {
					props: var_props_raw,
					span: DUMMY_SP,
				})),
			}
		};
		let const_props = if const_props_raw.is_empty() {
			get_null_arg()
		} else {
			self.build_unwrapped_props(const_props_raw)
		};

		let children = self.build_children(children);

		let flags = self.build_flags(flags);
		(should_sort, var_props, const_props, children, flags)
	}

	#[allow(clippy::cognitive_complexity)]
	fn internal_handle_jsx_props_obj(
		&mut self,
		expr: ast::ExprOrSpread,
		is_fn: bool,
		is_text_only: bool,
	) -> (
		bool,
		Vec<ast::PropOrSpread>,
		Vec<ast::PropOrSpread>,
		Option<Box<ast::Expr>>,
		u32,
	) {
		match expr {
			ast::ExprOrSpread {
				expr: box ast::Expr::Object(object),
				..
			} => {
				let mut var_props = vec![];
				let mut const_props = vec![];
				let mut children = None;
				// The identifiers that are static
				let const_idents: Vec<_> = self
					.decl_stack
					.iter()
					.flat_map(|v| v.iter())
					.filter(|(_, t)| matches!(t, IdentType::Var(true)))
					.cloned()
					.collect();

				let props = object.props;
				let last_spread_index = props
					.iter()
					.rposition(|p| matches!(p, ast::PropOrSpread::Spread(_)));
				let has_var_prop_after_last_spread = if let Some(index) = last_spread_index {
					props[index + 1..].iter().any(|prop| {
						if let ast::PropOrSpread::Prop(box ast::Prop::Shorthand(node)) = prop {
							if node.sym == *CHILDREN {
								return false;
							}
						}
						if let ast::PropOrSpread::Prop(box ast::Prop::KeyValue(ref node)) = prop {
							let key_word = match node.key {
								ast::PropName::Ident(ref ident) => Some(ident.sym.clone()),
								ast::PropName::Str(ref s) => Some(s.value.clone()),
								_ => None,
							};

							if let Some(key_word) = key_word {
								if key_word == *CHILDREN {
									return false;
								}
							}
						}
						if let ast::PropOrSpread::Spread(_) = prop {
							return true;
						}
						if let ast::PropOrSpread::Prop(box ast::Prop::KeyValue(node)) = prop {
							if is_const_expr(
								&node.value,
								&self.options.global_collect,
								Some(&const_idents),
							) {
								return false;
							}
						}
						true
					})
				} else {
					false
				};

				// Do we have spread arguments?
				let mut spread_props_count = props
					.iter()
					.filter(|prop| !matches!(prop, ast::PropOrSpread::Prop(_)))
					.count();

				let has_spread_props = spread_props_count > 0;

				// Check if we have bind:* props on a component (is_fn = true)
				// Components with bind props need _jsxSplit for runtime handling
				// In the edge case when fn is actually a string component at runtime
				let has_component_bind_props = is_fn && Self::component_has_bind_props(&props);

				let should_runtime_sort = has_spread_props || has_component_bind_props;
				let mut static_listeners = !has_spread_props;
				let mut static_subtree = !has_spread_props;
				let mut moved_captures = false; // Track if we've already added q:p or q:ps

				// Collect parameters to lift via q:p/q:ps:
				// Priority 1: iteration variables (loop context) - collected from iteration_var_stack
				// Priority 2: extra inline handler params (beyond event, element) - collected from handler signatures
				let element_lifted_params: Vec<ast::Ident> = if !is_fn {
					// Check if we're in a loop context
					if !self.iteration_var_stack.is_empty() {
						// Use iteration variables (existing loop behavior)
						if let Some(iter_vars) = self.iteration_var_stack.last() {
							let mut used_syms: HashSet<(Atom, SyntaxContext)> = HashSet::new();
							for prop in props.iter() {
								if let ast::PropOrSpread::Prop(box ast::Prop::KeyValue(ref node)) =
									prop
								{
									let key = match &node.key {
										ast::PropName::Ident(ref ident) => Some(ident.sym.clone()),
										ast::PropName::Str(ref s) => Some(s.value.clone()),
										_ => None,
									};
									if key.as_ref().and_then(convert_qrl_word).is_some()
										&& matches!(
											*node.value,
											ast::Expr::Arrow(_) | ast::Expr::Fn(_)
										) {
										for var in iter_vars {
											if expr_uses_ident(&node.value, &id!(var)) {
												used_syms.insert((var.sym.clone(), var.ctxt));
											}
										}
									}
								}
							}
							iter_vars
								.iter()
								.filter(|var| used_syms.contains(&(var.sym.clone(), var.ctxt)))
								.cloned()
								.collect()
						} else {
							Vec::new()
						}
					} else {
						// No loop context - collect union of captures from all event handlers
						let mut all_captures: Vec<Id> = Vec::new();
						for prop in props.iter() {
							if let ast::PropOrSpread::Prop(box ast::Prop::KeyValue(ref node)) = prop
							{
								let key = match &node.key {
									ast::PropName::Ident(ref ident) => Some(ident.sym.clone()),
									ast::PropName::Str(ref s) => Some(s.value.clone()),
									_ => None,
								};
								if key.as_ref().and_then(convert_qrl_word).is_some()
									&& matches!(*node.value, ast::Expr::Arrow(_) | ast::Expr::Fn(_))
								{
									let captures = self.compute_handler_captures(&node.value);
									for cap in captures {
										if !all_captures.contains(&cap) {
											all_captures.push(cap);
										}
									}
								}
							}
						}
						all_captures.sort();
						all_captures
							.iter()
							.map(|id| ast::Ident::new(id.0.clone(), DUMMY_SP, id.1))
							.collect()
					}
				} else {
					Vec::new()
				};
				let passive_events = collect_passive_event_names_from_props(&props);

				for prop in props.into_iter() {
					let mut name_token = false;
					// If we have spread props, all the props that come before it are variable even if they're static
					let mut is_target_const_props = spread_props_count == 0;
					let mut maybe_const_props: &mut Vec<ast::PropOrSpread> =
						if spread_props_count > 0 {
							&mut var_props
						} else {
							&mut const_props
						};
					match prop {
						// regular props
						ast::PropOrSpread::Prop(box ast::Prop::KeyValue(ref node)) => {
							let original_key_word = match node.key {
								ast::PropName::Ident(ref ident) => Some(ident.sym.clone()),
								ast::PropName::Str(ref s) => Some(s.value.clone()),
								_ => None,
							};

							// If we have spread props, and this is a bind: prop, it must go into varProps
							let is_bind_prop =
								original_key_word.as_ref().is_some_and(Self::is_bind_prop);
							if should_runtime_sort && !is_fn && is_bind_prop {
								is_target_const_props = false;
								maybe_const_props = &mut var_props;
							}

							// Transform JSX props (event handlers, className, bind:value/checked)
							let (key_word, transformed_event_key, skip_prop) = self
								.transform_jsx_prop(
									&original_key_word,
									node,
									maybe_const_props,
									TransformJsxPropContext {
										is_fn,
										passive_events: &passive_events,
										should_sort: should_runtime_sort,
										is_target_const_props,
									},
								);

							// Skip the bind: prop itself - don't add it to any props list
							if skip_prop {
								if name_token {
									self.stack_ctxt.pop();
								}
								continue;
							}

							// Update the key if it was transformed
							let final_key = if let Some(ref transformed_key) = transformed_event_key
							{
								// Use Str for keys that contain special characters like colons
								ast::PropName::Str(ast::Str {
									span: node.key.span(),
									value: transformed_key.clone(),
									raw: None,
								})
							} else {
								node.key.clone()
							};

							if let Some(key_word) = key_word {
								let is_children = key_word == *CHILDREN;
								if !is_children {
									self.stack_ctxt.push(key_word.to_string());
									name_token = true;
								}
								if is_children {
									let prev = self.jsx_mutable;
									self.jsx_mutable = false;
									let folded = node.value.clone();
									let transformed_children = if let Some(new_children) =
										self.convert_children(&folded, &const_idents)
									{
										// input, textarea etc
										if is_text_only {
											self.jsx_mutable = true;
											folded.fold_with(self)
										} else {
											Box::new(new_children.fold_with(self))
										}
									} else {
										folded.fold_with(self)
									};
									if self.jsx_mutable {
										static_subtree = false;
									} else {
										self.jsx_mutable = prev;
									}
									if spread_props_count > 0 {
										// e.g. <div children={<div />} {...props} />
										// self.jsx_mutable = true;
										// static_subtree = false;
										var_props.push(ast::PropOrSpread::Prop(Box::new(
											ast::Prop::KeyValue(ast::KeyValueProp {
												key: final_key.clone(),
												value: transformed_children,
											}),
										)));
									} else {
										children = Some(transformed_children);
									}
								} else if !is_fn && (key_word == *REF || key_word == *QSLOT) {
									// skip
									var_props.push(prop.fold_with(self));
								} else if convert_qrl_word(
									&original_key_word.clone().unwrap_or_default(),
								)
								.is_some()
								{
									if matches!(*node.value, ast::Expr::Arrow(_) | ast::Expr::Fn(_))
									{
										// Use element_lifted_params for both loop iteration vars
										// and non-loop captures (computed in pre-pass above)
										let params_to_lift: Vec<ast::Ident> =
											if !element_lifted_params.is_empty() && !is_fn {
												element_lifted_params.clone()
											} else {
												Vec::new()
											};

										// Inject lifted params as extra function params
										let transformed_value = if !params_to_lift.is_empty() {
											transform_event_handler_with_iter_var(
												*node.value.clone(),
												&params_to_lift,
											)
										} else {
											*node.value.clone()
										};

										let ctx_kind = if is_fn {
											SegmentKind::JSXProp
										} else {
											SegmentKind::EventHandler
										};

										let (converted_expr, is_const) = self
											._create_synthetic_qsegment(
												transformed_value,
												ctx_kind,
												original_key_word.clone().unwrap_or_default(),
												None,
											);

										if !is_const {
											static_listeners = false;
										}

										let handler_expr = Box::new(
											self.hoist_qrl_if_needed(converted_expr, is_fn),
										);
										self.add_prop_to_appropriate_list(
											handler_expr,
											final_key.clone(),
											&transformed_event_key,
											PropAddContext {
												is_const,
												is_fn,
												spread_props_count,
											},
											&mut var_props,
											&mut const_props,
										);

										// Add q:p (single) or q:ps (multiple) prop for lifted params
										// Apply to both loop-based iteration vars AND non-loop inline handler params
										if !params_to_lift.is_empty() && !is_fn && !moved_captures {
											let (prop_name, row_value): (&str, Box<ast::Expr>) =
												if params_to_lift.len() == 1 {
													// Single parameter: use q:p without array
													(
														"q:p",
														Box::new(ast::Expr::Ident(
															params_to_lift[0].clone(),
														)),
													)
												} else {
													// Multiple parameters: use q:ps with array
													(
														"q:ps",
														Box::new(ast::Expr::Array(ast::ArrayLit {
															span: DUMMY_SP,
															elems: params_to_lift
																.iter()
																.map(|ident| {
																	Some(ast::ExprOrSpread {
																		spread: None,
																		expr: Box::new(
																			ast::Expr::Ident(
																				ident.clone(),
																			),
																		),
																	})
																})
																.collect(),
														})),
													)
												};

											var_props.push(ast::PropOrSpread::Prop(Box::new(
												ast::Prop::KeyValue(ast::KeyValueProp {
													key: ast::PropName::Str(ast::Str {
														span: DUMMY_SP,
														value: Atom::from(prop_name),
														raw: None,
													}),
													value: row_value,
												}),
											)));
											moved_captures = true;
										}
									} else {
										let const_prop = is_const_expr(
											&node.value,
											&self.options.global_collect,
											Some(&const_idents),
										);
										if !const_prop {
											static_listeners = false;
										}

										self.add_prop_to_appropriate_list(
											node.value.clone(),
											final_key.clone(),
											&transformed_event_key,
											PropAddContext {
												is_const: const_prop,
												is_fn,
												spread_props_count,
											},
											&mut var_props,
											&mut const_props,
										);
									}
								} else if is_const_expr(
									&node.value,
									&self.options.global_collect,
									Some(&const_idents),
								) {
									let prop_to_add = self.create_prop_with_transformed_key(
										node,
										&prop,
										&transformed_event_key,
									);
									maybe_const_props.push(prop_to_add.fold_with(self));
								} else {
									// Check if the original expression captures any iteration variables
									let captures_iteration_var =
										if !self.iteration_var_stack.is_empty() {
											if let Some(iter_vars) = self.iteration_var_stack.last()
											{
												iter_vars.iter().any(|var| {
													expr_uses_ident(&node.value, &id!(var))
												})
											} else {
												false
											}
										} else {
											false
										};

									if let Some((getter, is_const)) =
										self.convert_to_getter(&node.value)
									{
										let entry: ast::PropOrSpread = ast::PropOrSpread::Prop(
											Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
												key: final_key.clone(),
												value: Box::new(getter),
											})),
										);
										// If it captures iteration variables, it must go to var_props
										if captures_iteration_var {
											var_props.push(entry);
										} else if is_fn || is_const {
											maybe_const_props.push(entry);
										} else {
											var_props.push(entry);
										}
									} else {
										let prop_to_add = self.create_prop_with_transformed_key(
											node,
											&prop,
											&transformed_event_key,
										);
										var_props.push(prop_to_add.fold_with(self));
									}
								}
							} else {
								var_props.push(prop.fold_with(self));
							}
						}
						ast::PropOrSpread::Prop(box ast::Prop::Shorthand(ref node)) => {
							let key_word = node.sym.clone();
							if key_word == *CHILDREN {
								children = Some(Box::new(ast::Expr::Ident(ast::Ident::new(
									CHILDREN.clone(),
									DUMMY_SP,
									Default::default(),
								))));
							} else {
								var_props.push(prop.fold_with(self));
							}
						}
						// spread props
						ast::PropOrSpread::Spread(spread) => {
							if spread.expr.is_ident() {
								let (_, var_props_call, const_props_call, _, _) =
									self.handle_jsx_props_obj_spread(&spread);

								let var_props_call_prop =
									ast::PropOrSpread::Spread(ast::SpreadElement {
										expr: var_props_call.expr,
										dot3_token: DUMMY_SP,
									});
								let const_props_call_prop =
									ast::PropOrSpread::Spread(ast::SpreadElement {
										expr: const_props_call.expr,
										dot3_token: DUMMY_SP,
									});

								var_props.push(var_props_call_prop);
								if spread_props_count > 1 || has_var_prop_after_last_spread {
									// Add both spreads to var_props since they'll be combined
									// or props after the last spread are var props
									var_props.push(const_props_call_prop);
								} else {
									// Single spread or last spread - keep the original separation
									// Props after the last spread are const props
									const_props.push(const_props_call_prop);
								}
							} else {
								// If the spread is not an ident, we need to handle it like default spread
								var_props.push(ast::PropOrSpread::Spread(spread).fold_with(self));
							}

							spread_props_count -= 1;
						}
						// other PropOrSpread cases (pretty much impossible)
						prop => {
							var_props.push(prop.fold_with(self));
							spread_props_count -= 1;
						}
					};
					if name_token {
						self.stack_ctxt.pop();
					}
				}
				let mut flags = 0;
				if static_listeners {
					flags |= 1 << 0;
				}
				if static_subtree {
					flags |= 1 << 1;
				}
				if moved_captures {
					flags |= 1 << 2;
				}
				if !should_runtime_sort {
					var_props.sort_by(|a: &ast::PropOrSpread, b: &ast::PropOrSpread| {
						match (a, b) {
							(
								ast::PropOrSpread::Prop(box ast::Prop::KeyValue(ref a)),
								ast::PropOrSpread::Prop(box ast::Prop::KeyValue(ref b)),
							) => {
								let a_key = match &a.key {
									ast::PropName::Ident(ident) => Some(ident.sym.as_ref()),
									ast::PropName::Str(s) => Some(s.value.as_ref()),
									_ => None,
								};
								let b_key = match b.key {
									ast::PropName::Ident(ref ident) => Some(ident.sym.as_ref()),
									ast::PropName::Str(ref s) => Some(s.value.as_ref()),
									_ => None,
								};
								match (a_key, b_key) {
									(Some(a_key), Some(b_key)) => a_key.cmp(b_key),
									_ => std::cmp::Ordering::Equal,
								}
							}
							_ => std::cmp::Ordering::Equal,
						}
					});
				}
				(should_runtime_sort, var_props, const_props, children, flags)
			}
			_ => (true, vec![], vec![], None, 0),
		}
	}

	fn handle_jsx_props_obj_spread(
		&mut self,
		spread: &SpreadElement,
	) -> (
		bool,
		ast::ExprOrSpread,
		ast::ExprOrSpread,
		ast::ExprOrSpread,
		ast::ExprOrSpread,
	) {
		let spread_expr = spread.expr.clone();
		let get_var_props = self.ensure_core_import(&_GET_VAR_PROPS);
		let get_const_props = self.ensure_core_import(&_GET_CONST_PROPS);

		let var_props_call = ast::Expr::Call(ast::CallExpr {
			callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(
				&get_var_props,
			)))),
			args: vec![ast::ExprOrSpread {
				spread: None,
				expr: spread_expr.clone(),
			}],
			..Default::default()
		});

		let const_props_call = ast::Expr::Call(ast::CallExpr {
			callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(
				&get_const_props,
			)))),
			args: vec![ast::ExprOrSpread {
				spread: None,
				expr: spread_expr,
			}],
			..Default::default()
		});

		(
			false, // should_sort, default to false, because props should be already sorted
			ast::ExprOrSpread {
				spread: None,
				expr: Box::new(var_props_call),
			},
			ast::ExprOrSpread {
				spread: None,
				expr: Box::new(const_props_call),
			},
			get_null_arg(), // children
			ast::ExprOrSpread {
				spread: None,
				expr: Box::new(ast::Expr::Lit(ast::Lit::Num(ast::Number {
					value: 0.0, // flags
					span: DUMMY_SP,
					raw: None,
				}))),
			},
		)
	}

	fn convert_children(
		&mut self,
		expr: &ast::Expr,
		const_idents: &Vec<IdPlusType>,
	) -> Option<ast::Expr> {
		match expr {
			ast::Expr::Call(call_expr) => {
				match &call_expr.callee {
					ast::Callee::Expr(box ast::Expr::Ident(ident)) => {
						if !self.jsx_functions.contains(&id!(ident)) {
							self.jsx_mutable = true;
						}
					}
					_ => {
						self.jsx_mutable = true;
					}
				};
				None
			}
			// tagged template functions can also be mutable
			ast::Expr::TaggedTpl(_) => {
				// We don't export template functions so no need to check
				self.jsx_mutable = true;
				None
			}
			ast::Expr::Array(array) => Some(ast::Expr::Array(ast::ArrayLit {
				span: array.span,
				elems: array
					.elems
					.iter()
					.map(|e| {
						if let Some(e) = e {
							if let Some(new) = self.convert_to_signal_item(&e.expr, const_idents) {
								Some(ast::ExprOrSpread {
									spread: e.spread,
									expr: Box::new(new),
								})
							} else {
								Some(e.clone())
							}
						} else {
							None
						}
					})
					.collect(),
			})),
			expr => self.convert_to_signal_item(expr, const_idents),
		}
	}

	/// Hoist an inlined function signal call by extracting the arrow function
	/// Returns the modified call expression with a hoisted function reference
	fn hoist_fn_signal_call(&mut self, mut call_expr: ast::CallExpr) -> ast::CallExpr {
		// Check if this is a _fnSignal call with an arrow function as first argument
		if call_expr.args.is_empty() {
			return call_expr;
		}

		let first_arg = &call_expr.args[0];
		if let ast::Expr::Arrow(arrow_expr) = &*first_arg.expr {
			// Render the arrow function to get a unique key
			let fn_body_str = render_expr(&ast::Expr::Arrow(arrow_expr.clone()));

			// Check if we've already hoisted this function
			if let Some(existing_id) = self.hoisted_fn_signals.get(&fn_body_str) {
				// Use the existing hoisted function
				call_expr.args[0] = ast::ExprOrSpread {
					spread: None,
					expr: Box::new(ast::Expr::Ident(new_ident_from_id(existing_id))),
				};

				// If there's a third argument (stringified version), replace it with a reference too
				if call_expr.args.len() >= 3 {
					if let ast::Expr::Lit(ast::Lit::Str(_)) = &*call_expr.args[2].expr {
						let str_id: Id = (format!("{}_str", existing_id.0).into(), existing_id.1);
						call_expr.args[2] = ast::ExprOrSpread {
							spread: None,
							expr: Box::new(ast::Expr::Ident(new_ident_from_id(&str_id))),
						};
					}
				}
			} else {
				// Create a new hoisted function
				let fn_name = format!("_hf{}", self.hoisted_fn_counter);
				self.hoisted_fn_counter += 1;

				let fn_id: Id = (fn_name.clone().into(), SyntaxContext::empty());

				// Store the mapping
				self.hoisted_fn_signals.insert(fn_body_str, fn_id.clone());

				// Create the const declaration for the hoisted function
				let const_decl = ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(Box::new(
					ast::VarDecl {
						span: DUMMY_SP,
						ctxt: Default::default(),
						kind: ast::VarDeclKind::Const,
						declare: false,
						decls: vec![ast::VarDeclarator {
							span: DUMMY_SP,
							name: ast::Pat::Ident(ast::BindingIdent {
								id: new_ident_from_id(&fn_id),
								type_ann: None,
							}),
							init: Some(Box::new(ast::Expr::Arrow(arrow_expr.clone()))),
							definite: false,
						}],
					},
				))));

				// Add to top items
				self.extra_top_items.insert(fn_id.clone(), const_decl);

				// If there's a third argument (stringified version), hoist it too
				if call_expr.args.len() >= 3 {
					if let ast::Expr::Lit(ast::Lit::Str(str_lit)) = &*call_expr.args[2].expr {
						let str_id: Id =
							(format!("{}_str", fn_name).into(), SyntaxContext::empty());

						// Create const declaration for the stringified version
						let str_decl = ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(
							Box::new(ast::VarDecl {
								span: DUMMY_SP,
								ctxt: Default::default(),
								kind: ast::VarDeclKind::Const,
								declare: false,
								decls: vec![ast::VarDeclarator {
									span: DUMMY_SP,
									name: ast::Pat::Ident(ast::BindingIdent {
										id: new_ident_from_id(&str_id),
										type_ann: None,
									}),
									init: Some(Box::new(ast::Expr::Lit(ast::Lit::Str(
										str_lit.clone(),
									)))),
									definite: false,
								}],
							}),
						)));

						self.extra_top_items.insert(str_id.clone(), str_decl);

						// Replace the string literal with a reference
						call_expr.args[2] = ast::ExprOrSpread {
							spread: None,
							expr: Box::new(ast::Expr::Ident(new_ident_from_id(&str_id))),
						};
					}
				}

				// Replace the arrow function with a reference to the hoisted function
				call_expr.args[0] = ast::ExprOrSpread {
					spread: None,
					expr: Box::new(ast::Expr::Ident(new_ident_from_id(&fn_id))),
				};
			}
		}

		call_expr
	}

	/// Convert an expression to a QRL or a getter. Returns (expr, isConst)
	/// This is needed to make sure signals aren't read unless they're used by the component
	fn convert_to_getter(&mut self, expr: &ast::Expr) -> Option<(ast::Expr, bool)> {
		let (inlined_expr, is_const) = self.create_synthetic_qqsegment(expr.clone(), true);
		if let Some(mut expr) = inlined_expr {
			// If the expression is a _fnSignal call, hoist the arrow function
			if let ast::Expr::Call(call_expr) = expr {
				let hoisted_call = self.hoist_fn_signal_call(call_expr);
				expr = ast::Expr::Call(hoisted_call);
			}
			return Some((expr, is_const));
		} else if is_const {
			return Some((expr.clone(), true));
		}
		None
	}

	fn convert_to_signal_item(
		&mut self,
		expr: &ast::Expr,
		const_idents: &Vec<IdPlusType>,
	) -> Option<ast::Expr> {
		if let ast::Expr::Call(call_expr) = expr {
			match &call_expr.callee {
				ast::Callee::Expr(box ast::Expr::Ident(ident)) => {
					if !self.jsx_functions.contains(&id!(ident)) {
						self.jsx_mutable = true;
					}
				}
				_ => {
					self.jsx_mutable = true;
				}
			};
			return None;
		}
		if is_const_expr(expr, &self.options.global_collect, Some(const_idents)) {
			return None;
		}
		let (inlined_expr, is_const) = self.create_synthetic_qqsegment(expr.clone(), false);
		if !is_const {
			self.jsx_mutable = true;
		}
		if inlined_expr.is_some() {
			return inlined_expr;
		} else if is_const {
			return None;
		}
		None
	}

	fn should_reg_segment(&self, ctx_name: &str) -> bool {
		if let Some(strip_ctx_name) = self.options.reg_ctx_name {
			if strip_ctx_name
				.iter()
				.any(|v| ctx_name.starts_with(v.as_ref()))
			{
				return true;
			}
		}
		false
	}

	/// Returns Some(is_dev_mode) if the call is an inlinedQrl/inlinedQrlDEV call, None otherwise.
	fn is_inlined_qrl_callee(&self, call_expr: &ast::CallExpr) -> Option<bool> {
		if let ast::Callee::Expr(box ast::Expr::Ident(ident)) = &call_expr.callee {
			let id = id!(ident);
			// Check pre-existing imports
			if let Some(import) = self.options.global_collect.imports.get(&id) {
				if import.specifier == *_INLINED_QRL {
					return Some(false);
				}
				if import.specifier == *_INLINED_QRL_DEV {
					return Some(true);
				}
			}
			// Check synthetic imports (generated by ensure_core_import)
			for (syn_id, import) in &self.options.global_collect.synthetic {
				if *syn_id == id {
					if import.specifier == *_INLINED_QRL {
						return Some(false);
					}
					if import.specifier == *_INLINED_QRL_DEV {
						return Some(true);
					}
				}
			}
		}
		None
	}

	/// Creates `q_name.s(fn_expr)` call statement
	fn create_ref_assignment(qrl_id: &Id, fn_expr: ast::Expr) -> ast::ModuleItem {
		ast::ModuleItem::Stmt(ast::Stmt::Expr(ast::ExprStmt {
			span: DUMMY_SP,
			expr: Box::new(ast::Expr::Call(ast::CallExpr {
				callee: ast::Callee::Expr(Box::new(ast::Expr::Member(ast::MemberExpr {
					obj: Box::new(ast::Expr::Ident(new_ident_from_id(qrl_id))),
					prop: ast::MemberProp::Ident(ast::IdentName::new("s".into(), DUMMY_SP)),
					span: DUMMY_SP,
				}))),
				args: vec![ast::ExprOrSpread {
					spread: None,
					expr: Box::new(fn_expr),
				}],
				span: DUMMY_SP,
				..Default::default()
			})),
		}))
	}

	fn should_emit_segment(&self, segment_data: &SegmentData) -> bool {
		if let Some(strip_ctx_name) = self.options.strip_ctx_name {
			if strip_ctx_name
				.iter()
				.any(|v| segment_data.ctx_name.starts_with(v.as_ref()))
			{
				return false;
			}
		}
		if self.options.strip_event_handlers && segment_data.ctx_kind == SegmentKind::EventHandler {
			return false;
		}
		true
	}

	// Noop segments are now added to the segments collection for manifest generation
	fn create_noop_qrl(
		&mut self,
		symbol_name: &swc_atoms::Atom,
		segment_data: SegmentData,
	) -> ast::CallExpr {
		// Add the noop segment to the segments collection for manifest generation
		let canonical_filename = get_canonical_filename(&segment_data.display_name, symbol_name);

		// Create a dummy expression for the noop segment
		let dummy_expr = ast::Expr::Lit(ast::Lit::Null(ast::Null { span: DUMMY_SP }));

		// Add the segment to the collection with entry set to None to indicate it's a noop
		self.segments.push(Segment {
			entry: None,
			span: DUMMY_SP,
			canonical_filename,
			name: symbol_name.clone(),
			data: segment_data.clone(),
			expr: Box::new(dummy_expr),
			hash: 0,
			param_names: None,
			qrl_id: None,
		});

		let mut args = vec![ast::Expr::Lit(ast::Lit::Str(ast::Str {
			span: DUMMY_SP,
			value: symbol_name.clone(),
			raw: None,
		}))];

		let mut fn_name: &Atom = &_NOOP_QRL;
		if matches!(self.options.mode, EmitMode::Dev | EmitMode::Hmr) {
			args.push(get_qrl_dev_obj(
				Atom::from(
					self.options
						.dev_path
						.unwrap_or(&self.options.path_data.abs_path.to_slash_lossy()),
				),
				&segment_data,
				&DUMMY_SP,
			));
			fn_name = &_NOOP_QRL_DEV;
		};

		self.emit_captures(&segment_data.captures, &mut args);
		self.create_internal_call(fn_name, args, true)
	}

	fn extract_param_names(expr: &ast::Expr) -> Option<Vec<Atom>> {
		fn pat_to_string(pat: &ast::Pat) -> Option<Atom> {
			match pat {
				ast::Pat::Ident(ident) => Some(ident.id.sym.clone()),
				ast::Pat::Rest(rest) => {
					pat_to_string(&rest.arg).map(|name| Atom::from(format!("...{}", name)))
				}
				ast::Pat::Array(array) => {
					let mut parts = Vec::new();
					for elem in &array.elems {
						match elem {
							Some(pat) => {
								if let Some(name) = pat_to_string(pat) {
									parts.push(name.to_string());
								}
							}
							None => parts.push("".to_string()),
						}
					}
					if parts.is_empty() {
						None
					} else {
						Some(Atom::from(format!("[{}]", parts.join(", "))))
					}
				}
				ast::Pat::Object(obj) => {
					let mut parts = Vec::new();
					for prop in &obj.props {
						match prop {
							ast::ObjectPatProp::KeyValue(kv) => {
								let key = match &kv.key {
									ast::PropName::Ident(ident) => ident.sym.to_string(),
									ast::PropName::Str(str) => str.value.to_string(),
									ast::PropName::Num(num) => num.value.to_string(),
									ast::PropName::BigInt(bigint) => bigint.value.to_string(),
									ast::PropName::Computed(_) => continue,
								};
								if let Some(value) = pat_to_string(&kv.value) {
									parts.push(format!("{}: {}", key, value));
								}
							}
							ast::ObjectPatProp::Assign(assign) => {
								parts.push(assign.key.sym.to_string());
							}
							ast::ObjectPatProp::Rest(_) => {
								// Skip rest properties in object patterns
							}
						}
					}
					if parts.is_empty() {
						None
					} else {
						Some(Atom::from(format!("{{{}}}", parts.join(", "))))
					}
				}
				_ => None,
			}
		}

		match expr {
			ast::Expr::Arrow(arrow) => {
				let mut names = Vec::with_capacity(arrow.params.len());
				for param in &arrow.params {
					if let Some(name) = pat_to_string(param) {
						names.push(name);
					}
				}
				if names.is_empty() {
					None
				} else {
					Some(names)
				}
			}
			ast::Expr::Fn(fn_expr) => {
				let mut names = Vec::with_capacity(fn_expr.function.params.len());
				for param in &fn_expr.function.params {
					if let Some(name) = pat_to_string(&param.pat) {
						names.push(name);
					}
				}
				if names.is_empty() {
					None
				} else {
					Some(names)
				}
			}
			_ => None,
		}
	}

	fn wrap_props_in_object(&self, props: Vec<ast::PropOrSpread>) -> ast::ExprOrSpread {
		ast::ExprOrSpread {
			spread: None,
			expr: Box::new(ast::Expr::Object(ast::ObjectLit {
				props,
				span: DUMMY_SP,
			})),
		}
	}

	fn build_unwrapped_props(&self, props: Vec<ast::PropOrSpread>) -> ast::ExprOrSpread {
		// If there's only one const prop and it's a spread of _getConstProps, pass it directly
		if props.len() == 1 {
			if let ast::PropOrSpread::Spread(spread) = &props[0] {
				if let ast::Expr::Call(call_expr) = &*spread.expr {
					if let ast::Callee::Expr(box ast::Expr::Ident(ident)) = &call_expr.callee {
						if ident.sym == *_GET_CONST_PROPS {
							// Pass _getConstProps directly without wrapping
							return ast::ExprOrSpread {
								spread: None,
								expr: spread.expr.clone(),
							};
						}
					}
				}
			}
		}

		// Otherwise, wrap in an object
		self.wrap_props_in_object(props)
	}

	fn build_children(&self, children: Option<Box<ast::Expr>>) -> ast::ExprOrSpread {
		if let Some(children) = children {
			ast::ExprOrSpread {
				spread: None,
				expr: children,
			}
		} else {
			get_null_arg()
		}
	}

	fn build_flags(&self, flags: u32) -> ast::ExprOrSpread {
		ast::ExprOrSpread {
			spread: None,
			expr: Box::new(ast::Expr::Lit(ast::Lit::Num(ast::Number {
				value: flags as f64,
				span: DUMMY_SP,
				raw: None,
			}))),
		}
	}

	/// Creates a prop with a potentially transformed key, or returns the original prop
	fn create_prop_with_transformed_key(
		&self,
		node: &ast::KeyValueProp,
		prop: &ast::PropOrSpread,
		transformed_event_key: &Option<Atom>,
	) -> ast::PropOrSpread {
		if let Some(ref transformed_key) = transformed_event_key {
			ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
				key: ast::PropName::Str(ast::Str {
					span: node.key.span(),
					value: transformed_key.clone(),
					raw: None,
				}),
				value: node.value.clone(),
			})))
		} else {
			prop.clone()
		}
	}

	/// Push a hoisting scope for the current function/arrow if needed.
	/// All functions create hoisting scopes EXCEPT callbacks (.map, .filter, etc.).
	/// Callbacks inside a loop also get a scope so QRLs capturing loop vars can be placed there.
	/// Returns true if a scope was created (caller should inject hoisted QRLs on exit).
	fn enter_hoisting_scope(&mut self) -> bool {
		let creates_hoisting_scope = !self.in_callback || !self.iteration_var_stack.is_empty();
		if creates_hoisting_scope {
			self.hoisting_scope_decl_indices
				.push(self.decl_stack.len().saturating_sub(1));
			self.hoisted_qrls.push(Vec::new());
			if !self.in_callback {
				self.component_depths
					.push(self.hoisted_qrls.len().saturating_sub(1));
			}
		}
		creates_hoisting_scope
	}

	/// Helper to inject hoisted QRLs into a block statement
	/// Returns true if QRLs were injected
	fn inject_hoisted_qrls_into_block(&mut self, stmts: &mut Vec<ast::Stmt>) -> bool {
		let popped_depth = self.hoisted_qrls.len().saturating_sub(1);
		if let Some(current_qrls) = self.hoisted_qrls.pop() {
			self.hoisting_scope_decl_indices.pop();
			if self.component_depths.last() == Some(&popped_depth) {
				self.component_depths.pop();
			}
			if !current_qrls.is_empty() {
				// Create const declarations for hoisted QRLs
				let mut qrl_stmts = Vec::new();
				for (_, declarator) in current_qrls {
					qrl_stmts.push(ast::Stmt::Decl(ast::Decl::Var(Box::new(ast::VarDecl {
						span: DUMMY_SP,
						kind: ast::VarDeclKind::Const,
						declare: false,
						ctxt: SyntaxContext::empty(),
						decls: vec![declarator],
					}))));
				}

				// Find the position to insert - after the last variable declaration
				let insert_pos = stmts
					.iter()
					.rposition(|stmt| matches!(stmt, ast::Stmt::Decl(ast::Decl::Var(_))))
					.map(|pos| pos + 1)
					.unwrap_or(0);

				// Insert hoisted QRLs after variable declarations
				stmts.splice(insert_pos..insert_pos, qrl_stmts);
				return true;
			}
		}
		false
	}

	/// Helper to add a prop to the appropriate props list based on const-ness and spread props
	/// Handles the special case of merging q-e:input handlers
	fn add_prop_to_appropriate_list(
		&mut self,
		expr: Box<ast::Expr>,
		final_key: ast::PropName,
		transformed_event_key: &Option<Atom>,
		context: PropAddContext,
		var_props: &mut Vec<ast::PropOrSpread>,
		const_props: &mut Vec<ast::PropOrSpread>,
	) {
		let is_const = context.is_const;
		let is_fn = context.is_fn;
		let spread_props_count = context.spread_props_count;
		// Check if this is an q-e:input handler that needs to be merged
		if transformed_event_key.as_ref() == Some(&*ON_INPUT) {
			let target_props = if is_fn || spread_props_count > 0 {
				if is_const && spread_props_count == 0 {
					const_props
				} else {
					var_props
				}
			} else if !is_const || spread_props_count > 0 {
				var_props
			} else {
				const_props
			};
			self.merge_or_add_event_handler(target_props, ON_INPUT.clone(), expr);
		} else {
			let converted_prop =
				ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
					value: expr,
					key: final_key,
				})));
			if is_fn || spread_props_count > 0 {
				if is_const && spread_props_count == 0 {
					const_props.push(converted_prop.fold_with(self));
				} else {
					var_props.push(converted_prop.fold_with(self));
				}
			} else if !is_const || spread_props_count > 0 {
				var_props.push(converted_prop.fold_with(self));
			} else {
				const_props.push(converted_prop.fold_with(self));
			}
		}
	}
}

impl<'a> Fold for QwikTransform<'a> {
	noop_fold_type!();

	fn fold_expr(&mut self, expr: ast::Expr) -> ast::Expr {
		let folded = expr.fold_children_with(self);
		if let Some(replacement) = self.pending_expr_replacement.take() {
			replacement
		} else {
			folded
		}
	}

	fn fold_module(&mut self, node: ast::Module) -> ast::Module {
		let mut body = Vec::with_capacity(node.body.len() + 10);
		let module_body: Vec<_> = node
			.body
			.into_iter()
			.flat_map(|i| {
				let module_item = i.fold_with(self);
				let output: Vec<_> = if matches!(self.options.entry_strategy, EntryStrategy::Hoist)
				{
					self.segments
						.drain(..)
						.flat_map(|segment| {
							let id = (
								segment.name.clone(),
								SyntaxContext::from_u32(segment.hash as u32),
							);
							let const_decl = ast::ModuleItem::Stmt(ast::Stmt::Decl(
								ast::Decl::Var(Box::new(ast::VarDecl {
									kind: ast::VarDeclKind::Const,
									decls: vec![ast::VarDeclarator {
										name: ast::Pat::Ident(ast::BindingIdent::from(
											new_ident_from_id(&id),
										)),
										init: Some(segment.expr),
										definite: false,
										span: DUMMY_SP,
									}],
									..Default::default()
								})),
							));
							// Emit .s() call right after the const definition
							// so bundlers can't reorder them
							if let Some(qrl_id) = &segment.qrl_id {
								let ref_assign = Self::create_ref_assignment(
									qrl_id,
									ast::Expr::Ident(new_ident_from_id(&id)),
								);
								vec![const_decl, ref_assign]
							} else {
								vec![const_decl]
							}
						})
						.chain(iter::once(module_item))
						.collect()
				} else {
					vec![module_item]
				};
				output
			})
			.collect();

		body.extend(
			self.options
				.global_collect
				.synthetic
				.iter()
				.map(|(new_local, import)| {
					create_synthetic_named_import(new_local, &import.source)
				}),
		);
		let extra_top_items = collect_needed_extra_top_items(
			&self.extra_top_items,
			&module_body,
			&self.extra_bottom_items,
			&self.ref_assignments,
		);

		// Separate imports from non-imports to ensure all imports stay at the top
		let (extra_imports, extra_non_imports): (Vec<_>, Vec<_>) =
			extra_top_items.into_iter().partition(|item| {
				matches!(
					item,
					ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(_))
				)
			});

		let (module_imports, module_non_imports): (Vec<_>, Vec<_>) =
			module_body.into_iter().partition(|item| {
				matches!(
					item,
					ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(_))
				)
			});

		// Assemble in proper order: all imports first, then non-imports
		body.extend(extra_imports);
		body.extend(module_imports);
		let non_imports = order_items_by_dependency(
			extra_non_imports
				.into_iter()
				.chain(self.ref_assignments.drain(..))
				.chain(module_non_imports)
				.collect(),
		);

		// Deduplicate declarations by symbol name before adding to body
		// Use symbol name (Atom) for comparison since SyntaxContext can vary across transformations
		let mut seen_syms: HashSet<Atom> = HashSet::new();
		let deduplicated_non_imports: Vec<ast::ModuleItem> = non_imports
			.into_iter()
			.filter(|item| {
				let mut item_defined_idents = HashSet::new();
				collect_declared_idents(item, &mut item_defined_idents);

				let is_duplicate = item_defined_idents
					.iter()
					.any(|id| seen_syms.contains(&id.0));
				if !is_duplicate {
					seen_syms.extend(item_defined_idents.iter().map(|id| id.0.clone()));
					true
				} else {
					false
				}
			})
			.collect();

		body.extend(deduplicated_non_imports);
		body.extend(self.extra_bottom_items.values().cloned());

		ast::Module { body, ..node }
	}

	// Variable tracking
	fn fold_var_decl(&mut self, node: ast::VarDecl) -> ast::VarDecl {
		if let Some(current_scope) = self.decl_stack.last_mut() {
			for decl in &node.decls {
				let mut identifiers: Vec<(Id, Span)> = Vec::with_capacity(node.decls.len() + 2);
				collect_from_pat(&decl.name, &mut identifiers);
				let mut static_identifiers: Vec<Id> = vec![];
				collect_static_identifiers(&mut static_identifiers, &decl.name, &decl.init);

				let is_const = node.kind == ast::VarDeclKind::Const;

				for ident in identifiers {
					let is_static = static_identifiers.contains(&ident.0);
					current_scope.push((ident.0, IdentType::Var(is_const && is_static)));
				}
			}
		}
		let is_const = node.kind == ast::VarDeclKind::Const;
		let folded = node.fold_children_with(self);

		// Store post-fold const initializers for potential inlining into segments.
		// When a $ call receives a simple identifier (e.g. useStyles$(style)),
		// we can replace it with the actual initializer expression.
		if is_const {
			for decl in &folded.decls {
				if let ast::Pat::Ident(ident) = &decl.name {
					if let Some(init) = &decl.init {
						// Skip simple Ident inits (e.g. hoisted QRL references like q_name...)
						if !matches!(**init, ast::Expr::Ident(_)) {
							self.const_initializers.insert(id!(ident.id), init.clone());
						}
					}
				}
			}
		}

		folded
	}

	fn fold_var_declarator(&mut self, node: ast::VarDeclarator) -> ast::VarDeclarator {
		let stacked = if let ast::Pat::Ident(ref ident) = node.name {
			self.stack_ctxt.push(ident.id.sym.to_string());
			true
		} else {
			false
		};
		let o = node.fold_children_with(self);
		if stacked {
			self.stack_ctxt.pop();
		}
		o
	}

	fn fold_fn_decl(&mut self, node: ast::FnDecl) -> ast::FnDecl {
		if let Some(current_scope) = self.decl_stack.last_mut() {
			current_scope.push((id!(node.ident), IdentType::Fn));
		}
		self.stack_ctxt.push(node.ident.sym.to_string());

		let o = node.fold_children_with(self);
		self.stack_ctxt.pop();
		o
	}

	fn fold_function(&mut self, node: ast::Function) -> ast::Function {
		self.decl_stack.push(vec![]);
		let creates_hoisting_scope = self.enter_hoisting_scope();

		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;

		let prev_jsx_mutable = self.jsx_mutable;
		self.jsx_mutable = false;

		let current_scope = self
			.decl_stack
			.last_mut()
			.expect("Declaration stack empty!");

		for param in &node.params {
			current_scope.extend(process_node_props(&param.pat));
		}

		let mut o = node.fold_children_with(self);

		// Inject hoisted QRLs if this function created a hoisting scope
		if creates_hoisting_scope {
			if let Some(body) = &mut o.body {
				self.inject_hoisted_qrls_into_block(&mut body.stmts);
			}
		}

		self.root_jsx_mode = prev;
		self.jsx_mutable = prev_jsx_mutable;
		self.decl_stack.pop();

		o
	}

	fn fold_arrow_expr(&mut self, node: ast::ArrowExpr) -> ast::ArrowExpr {
		self.decl_stack.push(vec![]);
		let creates_hoisting_scope = self.enter_hoisting_scope();

		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;

		let prev_jsx_mutable = self.jsx_mutable;
		self.jsx_mutable = false;

		let current_scope = self
			.decl_stack
			.last_mut()
			.expect("Declaration stack empty!");

		for param in &node.params {
			current_scope.extend(process_node_props(param));
		}

		let mut o = node.fold_children_with(self);

		// Inject hoisted QRLs if this arrow function created a hoisting scope
		if creates_hoisting_scope {
			match &mut *o.body {
				ast::BlockStmtOrExpr::BlockStmt(block) => {
					self.inject_hoisted_qrls_into_block(&mut block.stmts);
				}
				ast::BlockStmtOrExpr::Expr(expr) => {
					// For expression bodies, we need to check if there are QRLs to hoist
					// If so, convert to block statement
					let popped_depth = self.hoisted_qrls.len().saturating_sub(1);
					if let Some(current_qrls) = self.hoisted_qrls.pop() {
						self.hoisting_scope_decl_indices.pop();
						if self.component_depths.last() == Some(&popped_depth) {
							self.component_depths.pop();
						}
						if !current_qrls.is_empty() {
							// Create const declarations for hoisted QRLs
							let mut qrl_stmts = Vec::new();
							for (_, declarator) in current_qrls {
								qrl_stmts.push(ast::Stmt::Decl(ast::Decl::Var(Box::new(
									ast::VarDecl {
										span: DUMMY_SP,
										kind: ast::VarDeclKind::Const,
										declare: false,
										ctxt: SyntaxContext::empty(),
										decls: vec![declarator],
									},
								))));
							}

							// Add return statement with the original expression
							qrl_stmts.push(ast::Stmt::Return(ast::ReturnStmt {
								span: DUMMY_SP,
								arg: Some(expr.clone()),
							}));

							// Convert expression body to block statement
							o.body = Box::new(ast::BlockStmtOrExpr::BlockStmt(ast::BlockStmt {
								span: DUMMY_SP,
								ctxt: SyntaxContext::empty(),
								stmts: qrl_stmts,
							}));
						}
					}
				}
			}
		}

		self.root_jsx_mode = prev;
		self.jsx_mutable = prev_jsx_mutable;
		self.decl_stack.pop();

		o
	}

	fn fold_for_stmt(&mut self, node: ast::ForStmt) -> ast::ForStmt {
		self.decl_stack.push(vec![]);
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;

		// Track the loop variable from the initialization
		let iteration_vars = if let Some(ast::VarDeclOrExpr::VarDecl(ref var_decl)) = node.init {
			var_decl
				.decls
				.first()
				.and_then(|decl| {
					if let ast::Pat::Ident(ident) = &decl.name {
						Some(vec![ident.id.clone()])
					} else {
						None
					}
				})
				.unwrap_or_default()
		} else {
			Vec::new()
		};
		self.iteration_var_stack.push(iteration_vars);

		let o = node.fold_children_with(self);
		self.iteration_var_stack.pop();
		self.root_jsx_mode = prev;
		self.decl_stack.pop();

		o
	}

	fn fold_for_in_stmt(&mut self, node: ast::ForInStmt) -> ast::ForInStmt {
		self.decl_stack.push(vec![]);
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;

		// Track the loop variable
		let iteration_vars = match &node.left {
			ast::ForHead::VarDecl(var_decl) => var_decl.decls.first().and_then(|decl| {
				if let ast::Pat::Ident(ident) = &decl.name {
					Some(vec![ident.id.clone()])
				} else {
					None
				}
			}),
			ast::ForHead::Pat(pat) => {
				if let ast::Pat::Ident(ident) = &**pat {
					Some(vec![ident.id.clone()])
				} else {
					None
				}
			}
			_ => None,
		}
		.unwrap_or_default();
		self.iteration_var_stack.push(iteration_vars);

		let o = node.fold_children_with(self);
		self.iteration_var_stack.pop();
		self.root_jsx_mode = prev;
		self.decl_stack.pop();

		o
	}

	fn fold_for_of_stmt(&mut self, node: ast::ForOfStmt) -> ast::ForOfStmt {
		self.decl_stack.push(vec![]);
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;

		// Track the loop variable
		let iteration_vars = match &node.left {
			ast::ForHead::VarDecl(var_decl) => var_decl.decls.first().and_then(|decl| {
				if let ast::Pat::Ident(ident) = &decl.name {
					Some(vec![ident.id.clone()])
				} else {
					None
				}
			}),
			ast::ForHead::Pat(pat) => {
				if let ast::Pat::Ident(ident) = &**pat {
					Some(vec![ident.id.clone()])
				} else {
					None
				}
			}
			_ => None,
		}
		.unwrap_or_default();
		self.iteration_var_stack.push(iteration_vars);

		let current_scope = self
			.decl_stack
			.last_mut()
			.expect("Declaration stack empty!");

		match node.left.clone() {
			ast::ForHead::VarDecl(var_decl) => {
				for decl in &var_decl.decls {
					current_scope.extend(process_node_props(&decl.name));
				}
			}
			ast::ForHead::UsingDecl(using_decl) => {
				for decl in &using_decl.decls {
					current_scope.extend(process_node_props(&decl.name));
				}
			}
			ast::ForHead::Pat(pat) => {
				current_scope.extend(process_node_props(&pat));
			}
		}

		let o = node.fold_children_with(self);
		self.iteration_var_stack.pop();
		self.root_jsx_mode = prev;
		self.decl_stack.pop();

		o
	}

	fn fold_bin_expr(&mut self, node: ast::BinExpr) -> ast::BinExpr {
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;
		let o = node.fold_children_with(self);
		self.root_jsx_mode = prev;
		o
	}

	fn fold_cond_expr(&mut self, node: ast::CondExpr) -> ast::CondExpr {
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;
		let o = node.fold_children_with(self);
		self.root_jsx_mode = prev;
		o
	}

	fn fold_if_stmt(&mut self, node: ast::IfStmt) -> ast::IfStmt {
		self.decl_stack.push(vec![]);
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;
		let o = node.fold_children_with(self);
		self.root_jsx_mode = prev;
		self.decl_stack.pop();

		o
	}

	fn fold_block_stmt(&mut self, node: ast::BlockStmt) -> ast::BlockStmt {
		self.decl_stack.push(vec![]);
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;
		let o = node.fold_children_with(self);
		self.root_jsx_mode = prev;
		self.decl_stack.pop();

		o
	}

	fn fold_while_stmt(&mut self, node: ast::WhileStmt) -> ast::WhileStmt {
		self.decl_stack.push(vec![]);
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;

		// Try to extract the iteration variable from the condition
		// e.g., in "while (i < results.length)", extract "i"
		let iteration_vars = match &*node.test {
			ast::Expr::Bin(bin_expr) => {
				// Check left side of comparison
				match &*bin_expr.left {
					ast::Expr::Ident(ident) => vec![ident.clone()],
					_ => Vec::new(),
				}
			}
			_ => Vec::new(),
		};
		self.iteration_var_stack.push(iteration_vars);

		let o = node.fold_children_with(self);
		self.iteration_var_stack.pop();
		self.root_jsx_mode = prev;
		self.decl_stack.pop();

		o
	}

	fn fold_class_decl(&mut self, node: ast::ClassDecl) -> ast::ClassDecl {
		if let Some(current_scope) = self.decl_stack.last_mut() {
			current_scope.push((id!(node.ident), IdentType::Class));
		}

		self.stack_ctxt.push(node.ident.sym.to_string());
		self.decl_stack.push(vec![]);
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;
		let o = node.fold_children_with(self);
		self.root_jsx_mode = prev;
		self.stack_ctxt.pop();
		self.decl_stack.pop();

		o
	}

	fn fold_jsx_element(&mut self, node: ast::JSXElement) -> ast::JSXElement {
		let (stacked, is_native) = if let ast::JSXElementName::Ident(ref ident) = node.opening.name
		{
			// Native elements start with lowercase, components with uppercase
			let is_native_element = ident.sym.chars().next().is_some_and(|c| c.is_lowercase());
			self.stack_ctxt.push(ident.sym.to_string());
			self.jsx_element_is_native.push(is_native_element);
			self.jsx_element_passive_events
				.push(collect_passive_event_names_from_jsx_attrs(
					&node.opening.attrs,
				));
			(true, true)
		} else {
			(false, false)
		};
		let mut o = node.fold_children_with(self);
		if is_native {
			o.opening.attrs.retain(|attr| {
				!matches!(
					attr,
					ast::JSXAttrOrSpread::JSXAttr(ast::JSXAttr {
						name: ast::JSXAttrName::JSXNamespacedName(namespaced),
						..
					}) if namespaced.ns.sym.as_ref() == "passive"
				)
			});
		}
		if stacked {
			self.stack_ctxt.pop();
		}
		if is_native {
			self.jsx_element_is_native.pop();
			self.jsx_element_passive_events.pop();
		}
		o
	}

	fn fold_export_default_expr(&mut self, node: ast::ExportDefaultExpr) -> ast::ExportDefaultExpr {
		let mut filename = self.options.path_data.file_stem.clone();
		if filename == "index" {
			if let Some(foldername) = self
				.options
				.path_data
				.rel_dir
				.file_name()
				.and_then(|s| s.to_str())
			{
				filename = foldername.to_string();
			}
		}
		self.stack_ctxt.push(filename);
		let o = node.fold_children_with(self);
		self.stack_ctxt.pop();

		o
	}

	fn fold_jsx_attr(&mut self, node: ast::JSXAttr) -> ast::JSXAttr {
		let node = match node.name {
			ast::JSXAttrName::Ident(ref ident) => {
				let new_word = convert_qrl_word(&ident.sym);

				// Transform event names (onClick$ -> q-e:click) only on native HTML elements
				let is_native_element = self.jsx_element_is_native.last().copied().unwrap_or(false);
				let transformed_name = if is_native_element {
					let passive_events = self.jsx_element_passive_events.last();
					let is_passive = passive_events
						.and_then(|events| {
							jsx_event_to_event_name(ident.sym.as_ref())
								.map(|event| events.contains(&event))
						})
						.unwrap_or(false);
					if let Some(html_attr) =
						jsx_event_to_html_attribute(ident.sym.as_ref(), is_passive)
					{
						// Push transformed name to context for event handlers
						self.stack_ctxt.push(html_attr.to_string());
						Some(ast::JSXAttrName::Ident(ast::IdentName {
							span: ident.span,
							sym: html_attr,
						}))
					} else {
						// Push original name for non-event attributes
						self.stack_ctxt.push(ident.sym.to_string());
						None
					}
				} else {
					// On components, don't transform event names
					self.stack_ctxt.push(ident.sym.to_string());
					None
				};

				if new_word.is_some() {
					ast::JSXAttr {
						value: self.handle_jsx_value(ident.sym.clone(), node.value),
						name: transformed_name.unwrap_or_else(|| node.name.clone()),
						..node
					}
				} else if let Some(name) = transformed_name {
					ast::JSXAttr { name, ..node }
				} else {
					node
				}
			}
			ast::JSXAttrName::JSXNamespacedName(ref namespaced) => {
				let new_word = convert_qrl_word(&namespaced.name.sym);
				let jsx_attr_name = format!("{}:{}", namespaced.ns.sym, namespaced.name.sym);
				let context_name = format!("{}-{}", namespaced.ns.sym, namespaced.name.sym);
				let is_native_element = self.jsx_element_is_native.last().copied().unwrap_or(false);
				let transformed_name = if is_native_element {
					let passive_events = self.jsx_element_passive_events.last();
					let is_passive = passive_events
						.and_then(|events| {
							jsx_event_to_event_name(&jsx_attr_name)
								.map(|event| events.contains(&event))
						})
						.unwrap_or(false);
					if let Some(html_attr) = jsx_event_to_html_attribute(&jsx_attr_name, is_passive)
					{
						self.stack_ctxt.push(html_attr.to_string());
						Some(ast::JSXAttrName::Ident(ast::IdentName {
							span: namespaced.span,
							sym: html_attr,
						}))
					} else {
						self.stack_ctxt.push(context_name);
						None
					}
				} else {
					self.stack_ctxt.push(context_name);
					None
				};
				if new_word.is_some() {
					ast::JSXAttr {
						value: self.handle_jsx_value(Atom::from(jsx_attr_name), node.value),
						name: transformed_name.unwrap_or_else(|| node.name.clone()),
						..node
					}
				} else if let Some(name) = transformed_name {
					ast::JSXAttr { name, ..node }
				} else {
					node
				}
			}
		};

		let o = node.fold_children_with(self);
		self.stack_ctxt.pop();
		o
	}

	// Convert function calls, including those ending in `$`
	fn fold_call_expr(&mut self, node: ast::CallExpr) -> ast::CallExpr {
		let mut name_token = false;
		let mut replace_callee = None;
		let mut ctx_name: Atom = QSEGMENT.clone();

		// Check if this is an array iteration method call (e.g., .map(), .filter(), etc.)
		let is_iteration_method =
			if let ast::Callee::Expr(box ast::Expr::Member(member)) = &node.callee {
				matches!(
					prop_to_string(&member.prop).as_deref(),
					Some(
						"map"
							| "filter" | "forEach"
							| "flatMap" | "some" | "every"
							| "find" | "findIndex"
							| "reduce" | "reduceRight"
					)
				)
			} else {
				false
			};

		// Track iteration variable for array methods
		if is_iteration_method {
			self.in_callback = true;
			// Get ALL parameters from the callback function (e.g., item, index from map)
			let mut iteration_vars: Vec<ast::Ident> =
				node.args
					.first()
					.map_or(Vec::new(), |arg| match &*arg.expr {
						ast::Expr::Arrow(arrow) => arrow
							.params
							.iter()
							.filter_map(|param| {
								if let ast::Pat::Ident(ident) = param {
									Some(ident.id.clone())
								} else {
									None
								}
							})
							.collect(),
						ast::Expr::Fn(func) => func
							.function
							.params
							.iter()
							.filter_map(|param| {
								if let ast::Pat::Ident(ident) = &param.pat {
									Some(ident.id.clone())
								} else {
									None
								}
							})
							.collect(),
						_ => Vec::new(),
					});
			// Also collect top-level `const <ident> = <expr>` declarations from the
			// callback body. These derived consts (e.g. `const index = i + 1`) are in
			// scope at the JSX render site so they can be passed via `q:p`/`q:ps` as
			// positional arguments rather than captured via `_captures`.
			if let Some(arg) = node.args.first() {
				if let ast::Expr::Arrow(arrow) = &*arg.expr {
					if let box ast::BlockStmtOrExpr::BlockStmt(ref block) = arrow.body {
						for stmt in &block.stmts {
							if let ast::Stmt::Decl(ast::Decl::Var(var)) = stmt {
								if var.kind == ast::VarDeclKind::Const && var.decls.len() == 1 {
									if let ast::Pat::Ident(ident) = &var.decls[0].name {
										iteration_vars.push(ident.id.clone());
									}
								}
							}
						}
					}
				}
			}
			self.iteration_var_stack.push(iteration_vars);
		}

		let mut is_qcomponent = false;
		if let ast::Callee::Expr(box ast::Expr::Ident(ident)) = &node.callee {
			// Check if this is a _fnSignal call (either by ID or by checking if it's imported as _fnSignal)
			let is_fn_signal = id_eq!(ident, &self.fn_signal_fn) || {
				if let Some(import) = self.options.global_collect.imports.get(&id!(ident)) {
					import.specifier == *_INLINED_FN
				} else {
					false
				}
			};

			if id_eq!(ident, &self.sync_qrl_fn) {
				return self.handle_sync_qrl(node);
			} else if id_eq!(ident, &self.qsegment_fn) {
				if let Some(comments) = self.options.comments {
					comments.add_pure_comment(ident.span.lo);
				}
				let call = self.handle_qsegment(node);
				let hoisted = self.hoist_qrl_to_module_scope(call);
				self.pending_expr_replacement = Some(hoisted);
				return Default::default();
			} else if self.jsx_functions.contains(&id!(ident)) {
				return self.handle_jsx(node);
			} else if id_eq!(ident, &self.inlined_qrl_fn) {
				// Skip processing if the call should be left unchanged:
				// - null first arg (already a valid lazy QRL)
				// - non-literal second arg (dynamic symbol name)
				let should_skip =
					node.args
						.first()
						.is_some_and(|arg| matches!(*arg.expr, ast::Expr::Lit(ast::Lit::Null(_))))
						|| node.args.get(1).is_none_or(|arg| {
							!matches!(*arg.expr, ast::Expr::Lit(ast::Lit::Str(_)))
						});
				if should_skip {
					return node.fold_children_with(self);
				}
				let call = self.handle_inlined_qsegment(node);
				let hoisted = self.hoist_qrl_to_module_scope(call);
				self.pending_expr_replacement = Some(hoisted);
				return Default::default();
			} else if is_fn_signal {
				// Hoist _fnSignal calls
				let folded_node = node.fold_children_with(self);
				return self.hoist_fn_signal_call(folded_node);
			} else if let Some(specifier) = self.marker_functions.get(&id!(ident)) {
				self.stack_ctxt.push(ident.sym.to_string());
				ctx_name = specifier.clone();
				name_token = true;

				is_qcomponent = id_eq!(ident, &self.qcomponent_fn);
				if is_qcomponent {
					if let Some(comments) = self.options.comments {
						comments.add_pure_comment(node.span.lo);
					}
				}
				let global_collect = &mut self.options.global_collect;
				if let Some(import) = global_collect.imports.get(&id!(ident)).cloned() {
					let new_specifier =
						convert_qrl_word(&import.specifier).expect("Specifier ends with $");
					let new_local = self.ensure_import(&new_specifier, &import.source);
					replace_callee = Some(new_ident_from_id(&new_local).as_callee());
				} else {
					let new_specifier =
						convert_qrl_word(&ident.sym).expect("Specifier ends with $");
					let exported_local = global_collect
						.exports
						.get(&new_specifier)
						.map(|export_info| export_info.local_id.clone());
					if let Some(exported_local) = exported_local {
						replace_callee = Some(new_ident_from_id(&exported_local).as_callee());
					} else {
						self.emit_span_error_with_code(
							ident.span,
							&format!(
								"Found '{}' but did not find the corresponding '{}' exported in the same file. Please check that it is exported and spelled correctly",
								&ident.sym, &new_specifier
							),
							errors::get_diagnostic_code(
								errors::DiagnosticRule::MissingQrlImplementation,
							),
						);
					}
				}
			} else {
				self.stack_ctxt.push(ident.sym.to_string());
				name_token = true;
			}
		}

		let convert_qrl = replace_callee.is_some();
		let callee = if let Some(callee) = replace_callee {
			callee
		} else {
			node.callee
		};
		let callee = callee.fold_with(self);
		let args: Vec<ast::ExprOrSpread> = node
			.args
			.into_iter()
			.enumerate()
			.map(|(i, arg)| {
				if convert_qrl && i == 0 {
					let mut component_body = *arg.expr;

					// In HMR mode, inject _useHmr(devPath) as the first statement of component$ bodies
					if is_qcomponent && self.options.mode == EmitMode::Hmr {
						let hmr_local = self.ensure_core_import(&_USE_HMR);
						let dev_path = Atom::from(
							self.options
								.dev_path
								.unwrap_or(&self.options.path_data.abs_path.to_slash_lossy()),
						);
						let hmr_call_stmt = ast::Stmt::Expr(ast::ExprStmt {
							span: DUMMY_SP,
							expr: Box::new(ast::Expr::Call(ast::CallExpr {
								span: DUMMY_SP,
								callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(
									new_ident_from_id(&hmr_local),
								))),
								args: vec![ast::ExprOrSpread {
									spread: None,
									expr: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
										span: DUMMY_SP,
										value: dev_path,
										raw: None,
									}))),
								}],
								..Default::default()
							})),
						});

						component_body = prepend_stmt_to_fn(component_body, hmr_call_stmt);
					}

					let qrl = self.create_synthetic_qsegment(
						component_body,
						SegmentKind::Function,
						ctx_name.clone(),
						None,
					);
					let hoisted = self.hoist_qrl_to_module_scope(qrl);
					ast::ExprOrSpread {
						expr: Box::new(hoisted.fold_with(self)),
						..arg
					}
				} else {
					arg.fold_with(self)
				}
			})
			.collect();

		if name_token {
			self.stack_ctxt.pop();
		}

		// Clean up iteration tracking
		if is_iteration_method {
			self.iteration_var_stack.pop();
			self.in_callback = false;
		}

		ast::CallExpr {
			callee,
			args,
			..node
		}
	}
}

fn collect_needed_extra_top_items(
	extra_top_items: &BTreeMap<Id, ast::ModuleItem>,
	module_body: &[ast::ModuleItem],
	extra_bottom_items: &BTreeMap<Id, ast::ModuleItem>,
	ref_assignments: &[ast::ModuleItem],
) -> Vec<ast::ModuleItem> {
	if extra_top_items.is_empty() {
		return Vec::new();
	}

	let mut needed: HashSet<Id> = HashSet::new();
	for item in module_body {
		collect_module_item_idents(item, &mut needed);
	}
	for item in extra_bottom_items.values() {
		collect_module_item_idents(item, &mut needed);
	}
	for item in ref_assignments {
		collect_module_item_idents(item, &mut needed);
	}
	let mut needed_syms: HashSet<Atom> = needed.iter().map(|id| id.0.clone()).collect();

	let mut included: HashSet<Id> = HashSet::new();
	let mut changed = true;
	while changed {
		changed = false;
		for (id, item) in extra_top_items.iter() {
			if (needed.contains(id) || needed_syms.contains(&id.0)) && included.insert(id.clone()) {
				let mut item_used = HashSet::new();
				collect_module_item_idents(item, &mut item_used);
				for used in item_used {
					if needed.insert(used.clone()) {
						needed_syms.insert(used.0.clone());
						changed = true;
					}
				}
			}
		}
	}

	let mut result: Vec<_> = extra_top_items
		.iter()
		.filter(|&(id, _)| included.contains(id))
		.map(|(_, item)| item.clone())
		.collect();

	// Sort by source position to preserve original declaration order
	result.sort_by_key(|item| match item {
		ast::ModuleItem::Stmt(stmt) => stmt.span().lo,
		ast::ModuleItem::ModuleDecl(decl) => match decl {
			ast::ModuleDecl::Import(d) => d.span.lo,
			ast::ModuleDecl::ExportDecl(d) => d.span.lo,
			ast::ModuleDecl::ExportNamed(d) => d.span.lo,
			ast::ModuleDecl::ExportDefaultDecl(d) => d.span.lo,
			ast::ModuleDecl::ExportDefaultExpr(d) => d.span.lo,
			ast::ModuleDecl::ExportAll(d) => d.span.lo,
			ast::ModuleDecl::TsImportEquals(d) => d.span.lo,
			ast::ModuleDecl::TsExportAssignment(d) => d.span.lo,
			ast::ModuleDecl::TsNamespaceExport(d) => d.span.lo,
		},
	});

	result
}

fn collect_module_item_idents(item: &ast::ModuleItem, out: &mut HashSet<Id>) {
	let mut collector = AnyIdentCollector::new();
	item.visit_with(&mut collector);
	out.extend(collector.local_idents);
}

fn order_items_by_dependency(items: Vec<ast::ModuleItem>) -> Vec<ast::ModuleItem> {
	if items.len() < 2 {
		return items;
	}

	let mut defines_by_item: Vec<HashSet<Id>> = Vec::with_capacity(items.len());
	for item in items.iter() {
		let mut defines = HashSet::new();
		collect_declared_idents(item, &mut defines);
		defines_by_item.push(defines);
	}

	let mut deps_by_item: Vec<HashSet<usize>> = vec![HashSet::new(); items.len()];
	for (idx, item) in items.iter().enumerate() {
		let mut used = HashSet::new();
		collect_module_item_idents(item, &mut used);
		for id in &defines_by_item[idx] {
			used.remove(id);
		}
		for used_id in used {
			let def_idx_opt = defines_by_item
				.iter()
				.enumerate()
				.find_map(|(def_idx, defs)| {
					if def_idx != idx && defs.iter().any(|def_id| def_id.0 == used_id.0) {
						Some(def_idx)
					} else {
						None
					}
				});

			if let Some(def_idx) = def_idx_opt {
				deps_by_item[idx].insert(def_idx);
			}
		}
	}

	let mut in_degree = vec![0usize; items.len()];
	let mut dependents: Vec<Vec<usize>> = vec![Vec::new(); items.len()];
	for (idx, deps) in deps_by_item.iter().enumerate() {
		in_degree[idx] = deps.len();
		for dep_idx in deps {
			dependents[*dep_idx].push(idx);
		}
	}

	let mut ready: Vec<usize> = (0..items.len()).filter(|i| in_degree[*i] == 0).collect();
	ready.sort_unstable();
	let mut ordered: Vec<usize> = Vec::with_capacity(items.len());
	while let Some(idx) = ready.first().copied() {
		ready.remove(0);
		ordered.push(idx);
		for dependent in &dependents[idx] {
			in_degree[*dependent] = in_degree[*dependent].saturating_sub(1);
			if in_degree[*dependent] == 0 {
				ready.push(*dependent);
			}
		}
		ready.sort_unstable();
	}

	if ordered.len() < items.len() {
		let mut seen = vec![false; items.len()];
		for idx in &ordered {
			seen[*idx] = true;
		}
		for (i, _) in seen.iter().enumerate() {
			if !seen[i] {
				ordered.push(i);
			}
		}
	}

	ordered.into_iter().map(|idx| items[idx].clone()).collect()
}

fn collect_declared_idents(item: &ast::ModuleItem, out: &mut HashSet<Id>) {
	match item {
		ast::ModuleItem::Stmt(ast::Stmt::Decl(decl)) => {
			collect_declared_idents_from_decl(decl, out)
		}
		ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(decl)) => {
			collect_declared_idents_from_decl(&decl.decl, out);
		}
		ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDefaultDecl(decl)) => {
			if let ast::DefaultDecl::Fn(fn_decl) = &decl.decl {
				if let Some(ident) = &fn_decl.ident {
					out.insert(id!(ident));
				}
			}
			if let ast::DefaultDecl::Class(class_decl) = &decl.decl {
				if let Some(ident) = &class_decl.ident {
					out.insert(id!(ident));
				}
			}
		}
		_ => {}
	}
}

fn collect_declared_idents_from_decl(decl: &ast::Decl, out: &mut HashSet<Id>) {
	match decl {
		ast::Decl::Var(var) => {
			for decl in &var.decls {
				let mut identifiers: Vec<(Id, Span)> = Vec::new();
				collect_from_pat(&decl.name, &mut identifiers);
				out.extend(identifiers.into_iter().map(|(id, _)| id));
			}
		}
		ast::Decl::Fn(func) => {
			out.insert(id!(func.ident));
		}
		ast::Decl::Class(class) => {
			out.insert(id!(class.ident));
		}
		_ => {}
	}
}

/// Collects identifiers declared locally within an expression (arrow functions, function expressions, etc.)
/// This is used to filter out shadowed names from external dependency collection.
fn collect_local_declarations_from_expr(expr: &ast::Expr, out: &mut HashSet<Id>) {
	match expr {
		ast::Expr::Arrow(arrow) => {
			// Collect parameter names
			for param in &arrow.params {
				let mut identifiers: Vec<(Id, Span)> = Vec::new();
				collect_from_pat(param, &mut identifiers);
				out.extend(identifiers.into_iter().map(|(id, _)| id));
			}
			// Collect declarations from body if it's a block
			if let ast::BlockStmtOrExpr::BlockStmt(block) = &*arrow.body {
				collect_block_declarations(block, out);
			}
		}
		ast::Expr::Fn(func) => {
			// Collect function name if present
			if let Some(ident) = &func.ident {
				out.insert(id!(ident));
			}
			// Collect parameter names
			for param in &func.function.params {
				let mut identifiers: Vec<(Id, Span)> = Vec::new();
				collect_from_pat(&param.pat, &mut identifiers);
				out.extend(identifiers.into_iter().map(|(id, _)| id));
			}
			// Collect declarations from body
			if let Some(body) = &func.function.body {
				collect_block_declarations(body, out);
			}
		}
		_ => {}
	}
}

/// Collects variable and function declarations from a block statement
fn collect_block_declarations(block: &ast::BlockStmt, out: &mut HashSet<Id>) {
	for stmt in &block.stmts {
		match stmt {
			ast::Stmt::Decl(decl) => {
				collect_declared_idents_from_decl(decl, out);
			}
			// Handle nested blocks, if statements, etc.
			ast::Stmt::Block(block_stmt) => {
				collect_block_declarations(block_stmt, out);
			}
			ast::Stmt::If(if_stmt) => {
				if let ast::Stmt::Block(block) = &*if_stmt.cons {
					collect_block_declarations(block, out);
				}
				if let Some(alt) = &if_stmt.alt {
					if let ast::Stmt::Block(block) = &**alt {
						collect_block_declarations(block, out);
					}
				}
			}
			ast::Stmt::While(while_stmt) => {
				if let ast::Stmt::Block(block) = &*while_stmt.body {
					collect_block_declarations(block, out);
				}
			}
			ast::Stmt::For(for_stmt) => {
				// Collect loop variable if present
				if let Some(ast::VarDeclOrExpr::VarDecl(var_decl)) = &for_stmt.init {
					for decl in &var_decl.decls {
						let mut identifiers: Vec<(Id, Span)> = Vec::new();
						collect_from_pat(&decl.name, &mut identifiers);
						out.extend(identifiers.into_iter().map(|(id, _)| id));
					}
				}
				if let ast::Stmt::Block(block) = &*for_stmt.body {
					collect_block_declarations(block, out);
				}
			}
			ast::Stmt::ForIn(for_in) => {
				if let ast::ForHead::VarDecl(var_decl) = &for_in.left {
					for decl in &var_decl.decls {
						let mut identifiers: Vec<(Id, Span)> = Vec::new();
						collect_from_pat(&decl.name, &mut identifiers);
						out.extend(identifiers.into_iter().map(|(id, _)| id));
					}
				}
				if let ast::Stmt::Block(block) = &*for_in.body {
					collect_block_declarations(block, out);
				}
			}
			ast::Stmt::ForOf(for_of) => {
				if let ast::ForHead::VarDecl(var_decl) = &for_of.left {
					for decl in &var_decl.decls {
						let mut identifiers: Vec<(Id, Span)> = Vec::new();
						collect_from_pat(&decl.name, &mut identifiers);
						out.extend(identifiers.into_iter().map(|(id, _)| id));
					}
				}
				if let ast::Stmt::Block(block) = &*for_of.body {
					collect_block_declarations(block, out);
				}
			}
			ast::Stmt::Try(try_stmt) => {
				collect_block_declarations(&try_stmt.block, out);
				if let Some(catch) = &try_stmt.handler {
					// Collect the catch parameter binding (e.g. `catch (err)`)
					if let Some(param) = &catch.param {
						let mut identifiers: Vec<(Id, Span)> = Vec::new();
						collect_from_pat(param, &mut identifiers);
						out.extend(identifiers.into_iter().map(|(id, _)| id));
					}
					collect_block_declarations(&catch.body, out);
				}
				if let Some(finalizer) = &try_stmt.finalizer {
					collect_block_declarations(finalizer, out);
				}
			}
			ast::Stmt::DoWhile(do_while) => {
				if let ast::Stmt::Block(block) = &*do_while.body {
					collect_block_declarations(block, out);
				}
			}
			ast::Stmt::Switch(switch_stmt) => {
				for case in &switch_stmt.cases {
					for stmt in &case.cons {
						if let ast::Stmt::Block(block) = stmt {
							collect_block_declarations(block, out);
						} else if let ast::Stmt::Decl(decl) = stmt {
							collect_declared_idents_from_decl(decl, out);
						}
					}
				}
			}
			ast::Stmt::Labeled(labeled) => {
				if let ast::Stmt::Block(block) = &*labeled.body {
					collect_block_declarations(block, out);
				}
			}
			_ => {}
		}
	}
}

#[derive(Debug)]
enum ExprOrSkip {
	Expr,
	Skip,
}

#[derive(Debug)]
struct AnyIdentCollector {
	local_idents: HashSet<Id>,
	expr_ctxt: Vec<ExprOrSkip>,
}

impl AnyIdentCollector {
	fn new() -> Self {
		Self {
			local_idents: HashSet::new(),
			expr_ctxt: Vec::with_capacity(32),
		}
	}
}

impl Visit for AnyIdentCollector {
	noop_visit_type!();

	fn visit_expr(&mut self, node: &ast::Expr) {
		self.expr_ctxt.push(ExprOrSkip::Expr);
		node.visit_children_with(self);
		self.expr_ctxt.pop();
	}

	fn visit_stmt(&mut self, node: &ast::Stmt) {
		self.expr_ctxt.push(ExprOrSkip::Skip);
		node.visit_children_with(self);
		self.expr_ctxt.pop();
	}

	fn visit_jsx_element_name(&mut self, node: &ast::JSXElementName) {
		if let ast::JSXElementName::Ident(ref ident) = node {
			let ident_name = ident.sym.as_ref().chars().next();
			if let Some('A'..='Z') = ident_name {
			} else {
				return;
			}
		}

		node.visit_children_with(self);
	}

	fn visit_jsx_attr(&mut self, node: &ast::JSXAttr) {
		self.expr_ctxt.push(ExprOrSkip::Skip);
		node.visit_children_with(self);
		self.expr_ctxt.pop();
	}

	fn visit_ident(&mut self, node: &ast::Ident) {
		if matches!(self.expr_ctxt.last(), Some(ExprOrSkip::Expr))
			&& (node.sym != *"undefined"
				&& node.sym != *"NaN"
				&& node.sym != *"Infinity"
				&& node.sym != *"null")
		{
			self.local_idents.insert(id!(node));
		}
	}

	fn visit_key_value_prop(&mut self, node: &ast::KeyValueProp) {
		self.expr_ctxt.push(ExprOrSkip::Skip);
		node.visit_children_with(self);
		self.expr_ctxt.pop();
	}

	fn visit_member_expr(&mut self, member: &ast::MemberExpr) {
		self.expr_ctxt.push(ExprOrSkip::Skip);
		member.visit_children_with(self);
		self.expr_ctxt.pop();
	}
}

pub fn create_synthetic_named_export(local: &Id, exported: Option<Atom>) -> ast::ModuleItem {
	ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportNamed(ast::NamedExport {
		span: DUMMY_SP,
		type_only: false,
		with: None,
		specifiers: vec![ast::ExportSpecifier::Named(ast::ExportNamedSpecifier {
			span: DUMMY_SP,
			is_type_only: false,
			orig: ast::ModuleExportName::Ident(new_ident_from_id(local)),
			exported: exported.map(|name| {
				ast::ModuleExportName::Ident(ast::Ident::new(
					name,
					DUMMY_SP,
					SyntaxContext::empty(),
				))
			}),
		})],
		src: None,
	}))
}

pub fn create_synthetic_named_import(local: &Id, src: &Atom) -> ast::ModuleItem {
	ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(ast::ImportDecl {
		phase: Default::default(),
		span: DUMMY_SP,
		src: Box::new(ast::Str {
			span: DUMMY_SP,
			value: src.clone(),
			raw: None,
		}),
		with: None,
		type_only: false,
		specifiers: vec![ast::ImportSpecifier::Named(ast::ImportNamedSpecifier {
			is_type_only: false,
			span: DUMMY_SP,
			local: new_ident_from_id(local),
			imported: None,
		})],
	}))
}

fn escape_sym(str: &str) -> String {
	str.chars()
		.flat_map(|x| match x {
			'A'..='Z' | 'a'..='z' | '0'..='9' => Some(x),
			_ => Some('_'),
		})
		// trim and squash underscores
		.fold((String::new(), None), |(mut acc, prev), x| {
			if x == '_' {
				if prev.is_none() {
					(acc, None)
				} else {
					(acc, Some('_'))
				}
			} else {
				if prev == Some('_') {
					acc.push('_');
				}
				acc.push(x);
				(acc, Some(x))
			}
		})
		.0
}

fn normalize_jsx_event_name(name: &str) -> String {
	if name == "DOMContentLoaded" {
		return "-d-o-m-content-loaded".to_string();
	}

	let processed_name = if let Some(stripped) = name.strip_prefix('-') {
		// marker for case sensitive event name
		stripped.to_string()
	} else {
		name.to_lowercase()
	};

	create_event_name(&processed_name, "").to_string()
}

fn jsx_event_to_event_name(jsx_event: &str) -> Option<String> {
	if !jsx_event.ends_with('$') {
		return None;
	}

	let (_, idx) = get_event_scope_data_from_jsx_event(jsx_event, false);

	if idx == usize::MAX {
		return None;
	}

	Some(normalize_jsx_event_name(
		&jsx_event[idx..jsx_event.len() - 1],
	))
}

fn passive_attr_to_event_name(passive_attr: &str) -> Option<String> {
	passive_attr
		.strip_prefix("passive:")
		.map(normalize_jsx_event_name)
}

fn collect_passive_event_names_from_props(props: &[ast::PropOrSpread]) -> HashSet<String> {
	props
		.iter()
		.filter_map(|prop| match prop {
			ast::PropOrSpread::Prop(prop) => match prop.as_ref() {
				ast::Prop::KeyValue(node) => match &node.key {
					ast::PropName::Ident(ident) => passive_attr_to_event_name(ident.sym.as_ref()),
					ast::PropName::Str(s) => passive_attr_to_event_name(s.value.as_ref()),
					_ => None,
				},
				_ => None,
			},
			_ => None,
		})
		.collect()
}

fn collect_passive_event_names_from_jsx_attrs(attrs: &[ast::JSXAttrOrSpread]) -> HashSet<String> {
	attrs
		.iter()
		.filter_map(|attr| {
			if let ast::JSXAttrOrSpread::JSXAttr(jsx_attr) = attr {
				match &jsx_attr.name {
					ast::JSXAttrName::Ident(ident) => {
						passive_attr_to_event_name(ident.sym.as_ref())
					}
					ast::JSXAttrName::JSXNamespacedName(namespaced)
						if namespaced.ns.sym == *"passive" =>
					{
						passive_attr_to_event_name(
							format!("passive:{}", namespaced.name.sym).as_str(),
						)
					}
					_ => None,
				}
			} else {
				None
			}
		})
		.collect()
}

/// Converts JSX event names (e.g., onClick$) to HTML attribute names (e.g., q-e:click)
/// Follows the same logic as jsxEventToHtmlAttribute in event-names.ts
fn jsx_event_to_html_attribute(jsx_event: &str, is_passive: bool) -> Option<Atom> {
	if !jsx_event.ends_with('$') {
		return None;
	}

	let (prefix, idx) = get_event_scope_data_from_jsx_event(jsx_event, is_passive);

	if idx == usize::MAX {
		return None;
	}

	Some(Atom::from(format!(
		"{}{}",
		prefix,
		normalize_jsx_event_name(&jsx_event[idx..jsx_event.len() - 1])
	)))
}

/// Get the event scope prefix and starting index from a JSX event name
fn get_event_scope_data_from_jsx_event(jsx_event: &str, is_passive: bool) -> (&str, usize) {
	if jsx_event.starts_with("window:on") {
		(if is_passive { "q-wp:" } else { "q-w:" }, 9)
	} else if jsx_event.starts_with("document:on") {
		(if is_passive { "q-dp:" } else { "q-d:" }, 11)
	} else if jsx_event.starts_with("on") {
		(if is_passive { "q-ep:" } else { "q-e:" }, 2)
	} else {
		("", usize::MAX)
	}
}

/// Create an event name by converting from camelCase to kebab-case
/// Follows the same logic as fromCamelToKebabCase in event-names.ts
fn create_event_name(name: &str, prefix: &str) -> Atom {
	let mut result = String::from(prefix);

	for c in name.chars() {
		if c.is_ascii_uppercase() || c == '-' {
			result.push('-');
			result.push(c.to_ascii_lowercase());
		} else {
			result.push(c);
		}
	}

	Atom::from(result)
}

const fn can_capture_scope(expr: &ast::Expr) -> bool {
	matches!(expr, &ast::Expr::Fn(_) | &ast::Expr::Arrow(_))
}

/// Get parameter identifiers from a function expression
fn get_function_params(expr: &ast::Expr) -> Vec<Id> {
	let mut params = Vec::new();

	match expr {
		ast::Expr::Arrow(arrow) => {
			for param in &arrow.params {
				let mut identifiers = vec![];
				collect_from_pat(param, &mut identifiers);
				params.extend(identifiers.into_iter().map(|(id, _)| id));
			}
		}
		ast::Expr::Fn(fn_expr) => {
			for param in &fn_expr.function.params {
				let mut identifiers = vec![];
				collect_from_pat(&param.pat, &mut identifiers);
				params.extend(identifiers.into_iter().map(|(id, _)| id));
			}
		}
		_ => {}
	}

	params
}

fn base64(nu: u64) -> String {
	base64::engine::general_purpose::URL_SAFE_NO_PAD
		.encode(nu.to_le_bytes())
		.replace(['-', '_'], "0")
}

/// Check if an expression references a specific identifier
fn expr_uses_ident(expr: &ast::Expr, target_id: &Id) -> bool {
	struct IdentChecker {
		target_id: Id,
		found: bool,
	}

	impl Visit for IdentChecker {
		noop_visit_type!();

		fn visit_ident(&mut self, ident: &ast::Ident) {
			if id!(ident) == self.target_id {
				self.found = true;
			}
		}
	}

	let mut checker = IdentChecker {
		target_id: target_id.clone(),
		found: false,
	};

	// For arrow/fn expressions, we want to check the body, not the whole expression
	match expr {
		ast::Expr::Arrow(arrow) => match &*arrow.body {
			ast::BlockStmtOrExpr::BlockStmt(block) => block.visit_with(&mut checker),
			ast::BlockStmtOrExpr::Expr(expr) => expr.visit_with(&mut checker),
		},
		ast::Expr::Fn(fn_expr) => {
			if let Some(body) = &fn_expr.function.body {
				body.visit_with(&mut checker);
			}
		}
		_ => {
			expr.visit_with(&mut checker);
		}
	}

	checker.found
}

/// Placeholder param for event handler slot: 0 => _, 1 => _1, 2 => _2, ...
fn event_handler_placeholder_pat(slot_index: usize) -> ast::Pat {
	let sym = if slot_index == 0 {
		Atom::from("_")
	} else {
		Atom::from(format!("_{}", slot_index))
	};
	ast::Pat::Ident(ast::BindingIdent {
		id: ast::Ident::new(sym, DUMMY_SP, SyntaxContext::empty()),
		type_ann: None,
	})
}

/// Push one param: use value if present, otherwise placeholder for slot_index.
fn push_event_handler_param(
	new_params: &mut Vec<ast::Pat>,
	value: Option<ast::Pat>,
	slot_index: usize,
) {
	new_params.push(value.unwrap_or_else(|| event_handler_placeholder_pat(slot_index)));
}

/// Build the parameter patterns for an event handler: (event, element) plus iteration vars.
/// Used by both arrow and fn handlers; caller wraps in `ast::Param` for fn.
fn build_event_handler_param_pats(
	existing_param_count: usize,
	get_existing_pat: impl Fn(usize) -> ast::Pat,
	element_iter_vars: &[ast::Ident],
	used: &[bool],
	last_used_index: Option<usize>,
) -> Vec<ast::Pat> {
	let mut new_params = Vec::new();

	// Positions 0 and 1: event, element (placeholders _ and _1)
	for slot_index in 0..2 {
		let value = (slot_index < existing_param_count).then(|| get_existing_pat(slot_index));
		push_event_handler_param(&mut new_params, value, slot_index);
	}

	// Element iteration vars up to last used: use real ident if handler uses it, else placeholder _2, _3, ...
	if let Some(last) = last_used_index {
		for (i, iter_var) in element_iter_vars.iter().enumerate().take(last + 1) {
			let slot_index = 2 + i;
			let value = if used[i] {
				Some(ast::Pat::Ident(ast::BindingIdent {
					id: iter_var.clone(),
					type_ann: None,
				}))
			} else {
				None
			};
			push_event_handler_param(&mut new_params, value, slot_index);
		}
	}

	// Any additional existing parameters beyond the first 2
	for i in 2..existing_param_count {
		new_params.push(get_existing_pat(i));
	}

	new_params
}

/// Transform event handler to add iteration variables as parameters.
/// Takes the element's full list of iteration vars (in loop order) so param order matches q:ps.
/// For each var: if the handler uses it, add that ident; otherwise add a placeholder (_2, _3, ...).
/// Converts: onClick$(() => cart.push(item)) with element_iter_vars [item, index]
/// To: onClick$((_, _1, item) => cart.push(item))
/// Or: onClick$(() => clickedIndex.value = idx)
/// To: onClick$((_, _1, _2, idx) => clickedIndex.value = idx)
/// Or: onClick$(() => console.log(item, idx))
/// To: onClick$((_, _1, item, idx) => console.log(item, idx))
fn transform_event_handler_with_iter_var(
	expr: ast::Expr,
	element_iter_vars: &[ast::Ident],
) -> ast::Expr {
	if element_iter_vars.is_empty() {
		return expr;
	}

	// Compute which vars this handler uses before matching (expr is moved in the match)
	let used: Vec<bool> = element_iter_vars
		.iter()
		.map(|var| expr_uses_ident(&expr, &id!(var)))
		.collect();
	// Only add params up to and including the last used var; skip trailing unused (no placeholder)
	let last_used_index = used.iter().rposition(|&u| u);

	match expr {
		ast::Expr::Arrow(mut arrow) => {
			let new_params = build_event_handler_param_pats(
				arrow.params.len(),
				|i| arrow.params[i].clone(),
				element_iter_vars,
				&used,
				last_used_index,
			);
			arrow.params = new_params;
			ast::Expr::Arrow(arrow)
		}
		ast::Expr::Fn(mut fn_expr) => {
			let pats = build_event_handler_param_pats(
				fn_expr.function.params.len(),
				|i| fn_expr.function.params[i].pat.clone(),
				element_iter_vars,
				&used,
				last_used_index,
			);
			fn_expr.function.params = pats
				.into_iter()
				.map(|pat| ast::Param {
					span: DUMMY_SP,
					decorators: vec![],
					pat,
				})
				.collect();
			ast::Expr::Fn(fn_expr)
		}
		_ => expr,
	}
}

fn compute_scoped_idents(all_idents: &[Id], all_decl: &[IdPlusType]) -> (Vec<Id>, bool) {
	let mut set: HashSet<Id> = HashSet::new();
	let mut is_const = true;
	for ident in all_idents {
		if let Some(item) = all_decl.iter().find(|item| item.0 == *ident) {
			set.insert(ident.clone());
			if !matches!(item.1, IdentType::Var(true)) {
				is_const = false;
			}
		}
	}
	let mut output: Vec<Id> = set.into_iter().collect();
	output.sort();
	(output, is_const)
}

fn get_canonical_filename(display_name: &Atom, symbol_name: &Atom) -> Atom {
	let hash = symbol_name.split('_').next_back().unwrap();
	Atom::from(format!("{}_{}", display_name, hash))
}

fn parse_symbol_name(symbol_name: Atom, dev: bool, file_name: &String) -> (Atom, Atom, Atom) {
	let mut splitter = symbol_name.rsplitn(2, '_');
	let hash = splitter
		.next()
		.expect("symbol_name always need to have a segment");
	let display_name = format!("{}_{}", file_name, splitter.next().unwrap_or(hash));

	let s_n = if dev {
		symbol_name.clone()
	} else {
		Atom::from(format!("s_{}", hash))
	};
	(s_n, display_name.into(), hash.into())
}

fn get_qrl_dev_obj(abs_path: Atom, segment: &SegmentData, span: &Span) -> ast::Expr {
	ast::Expr::Object(ast::ObjectLit {
		span: DUMMY_SP,
		props: vec![
			ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
				key: ast::PropName::Ident(ast::IdentName::new(atom!("file"), DUMMY_SP)),
				value: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
					span: DUMMY_SP,
					value: abs_path,
					raw: None,
				}))),
			}))),
			ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
				key: ast::PropName::Ident(ast::IdentName::new(Atom::from("lo"), DUMMY_SP)),
				value: Box::new(ast::Expr::Lit(ast::Lit::Num(ast::Number {
					span: DUMMY_SP,
					value: span.lo().0 as f64,
					raw: None,
				}))),
			}))),
			ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
				key: ast::PropName::Ident(ast::IdentName::new(Atom::from("hi"), DUMMY_SP)),
				value: Box::new(ast::Expr::Lit(ast::Lit::Num(ast::Number {
					span: DUMMY_SP,
					value: span.hi().0 as f64,
					raw: None,
				}))),
			}))),
			ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
				key: ast::PropName::Ident(ast::IdentName::new(Atom::from("displayName"), DUMMY_SP)),
				value: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
					span: DUMMY_SP,
					value: segment.display_name.clone(),
					raw: None,
				}))),
			}))),
		],
	})
}

fn prop_to_string(prop: &ast::MemberProp) -> Option<Atom> {
	match prop {
		ast::MemberProp::Ident(ident) => Some(ident.sym.clone()),
		ast::MemberProp::Computed(ast::ComputedPropName {
			expr: box ast::Expr::Lit(ast::Lit::Str(str)),
			..
		}) => Some(str.value.clone()),
		_ => None,
	}
}

fn collect_static_identifiers(
	static_idents: &mut Vec<Id>,
	decl_name: &ast::Pat,
	decl_init: &Option<Box<ast::Expr>>,
) {
	match decl_name {
		ast::Pat::Ident(ref ident) => {
			if is_return_static(decl_init) {
				static_idents.push(id!(ident));
			}
		}
		ast::Pat::Array(ref decl_name_array) => {
			if let Some(box ast::Expr::Array(ref decl_init_array)) = decl_init {
				decl_name_array
					.elems
					.iter()
					.zip(decl_init_array.elems.iter())
					.for_each(|(name, init)| {
						if let Some(name) = name {
							if let Some(init) = init {
								collect_static_identifiers(
									static_idents,
									name,
									&Some(init.clone().expr),
								);
							}
						}
					});
			} else {
				decl_name_array.elems.iter().for_each(|name| {
					if let Some(name) = name {
						collect_static_identifiers(static_idents, name, decl_init);
					}
				});
			}
		}
		ast::Pat::Object(ref decl_name_object) => {
			if let Some(box ast::Expr::Object(ref decl_init_object)) = decl_init {
				decl_name_object
					.props
					.iter()
					.zip(decl_init_object.props.iter())
					.for_each(|(name, init)| {
						if let ast::ObjectPatProp::Assign(name_assign) = name {
							let ast::BindingIdent { id, .. } = &name_assign.key;
							if let ast::PropOrSpread::Prop(box ast::Prop::KeyValue(
								ast::KeyValueProp { value, .. },
							)) = init
							{
								collect_static_identifiers(
									static_idents,
									&ast::Pat::Ident(ast::BindingIdent {
										id: id.clone(),
										type_ann: None,
									}),
									&Some(value.clone()),
								);
							}
						}
					});
			} else {
				decl_name_object.props.iter().for_each(|name| {
					if let ast::ObjectPatProp::Assign(name_assign) = name {
						let ast::BindingIdent { id, .. } = &name_assign.key;
						collect_static_identifiers(
							static_idents,
							&ast::Pat::Ident(ast::BindingIdent {
								id: id.clone(),
								type_ann: None,
							}),
							decl_init,
						);
					}
				});
			}
		}

		_ => {}
	}
}

fn is_return_static(expr: &Option<Box<ast::Expr>>) -> bool {
	match expr {
		Some(box ast::Expr::Call(ast::CallExpr {
			callee: ast::Callee::Expr(box ast::Expr::Ident(ident)),
			..
		})) => ident.sym.ends_with('$') || ident.sym.ends_with("Qrl") || ident.sym.starts_with("use"),
		Some(_) => false,
		None => true,
	}
}

fn make_wrap(method: &Id, obj: Box<ast::Expr>, prop: Atom) -> ast::Expr {
	// if the prop is the same as "value", don't pass the prop
	let args = if prop == *"value" {
		vec![ast::ExprOrSpread::from(obj)]
	} else {
		vec![
			ast::ExprOrSpread::from(obj),
			ast::ExprOrSpread::from(Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str::from(
				prop,
			))))),
		]
	};
	ast::Expr::Call(ast::CallExpr {
		callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(method)))),
		args,
		..Default::default()
	})
}

fn get_null_arg() -> ast::ExprOrSpread {
	ast::ExprOrSpread {
		spread: None,
		expr: Box::new(ast::Expr::Lit(ast::Lit::Null(ast::Null { span: DUMMY_SP }))),
	}
}

fn is_text_only(node: &str) -> bool {
	matches!(
		node,
		"text" | "textarea" | "title" | "option" | "script" | "style" | "noscript"
	)
}

/// Prepend a statement to a function/arrow expression body.
/// For arrow expressions with expression bodies, converts to a block body with the prepended
/// statement and a return statement.
fn prepend_stmt_to_fn(expr: ast::Expr, stmt: ast::Stmt) -> ast::Expr {
	match expr {
		ast::Expr::Arrow(mut arrow) => {
			match *arrow.body {
				ast::BlockStmtOrExpr::BlockStmt(mut block) => {
					block.stmts.insert(0, stmt);
					arrow.body = Box::new(ast::BlockStmtOrExpr::BlockStmt(block));
				}
				ast::BlockStmtOrExpr::Expr(expr) => {
					let block = ast::BlockStmt {
						span: DUMMY_SP,
						stmts: vec![
							stmt,
							ast::Stmt::Return(ast::ReturnStmt {
								span: DUMMY_SP,
								arg: Some(expr),
							}),
						],
						..Default::default()
					};
					arrow.body = Box::new(ast::BlockStmtOrExpr::BlockStmt(block));
				}
			}
			ast::Expr::Arrow(arrow)
		}
		ast::Expr::Fn(mut fn_expr) => {
			if let Some(ref mut body) = fn_expr.function.body {
				body.stmts.insert(0, stmt);
			}
			ast::Expr::Fn(fn_expr)
		}
		// For other expression types, wrap in an IIFE-like pattern
		// This shouldn't normally happen for component$ arguments
		other => other,
	}
}

fn process_node_props(pat: &ast::Pat) -> Vec<IdPlusType> {
	let mut identifiers = vec![];
	let mut processed_scope_data: Vec<IdPlusType> = vec![];
	collect_from_pat(pat, &mut identifiers);
	processed_scope_data.extend(
		identifiers
			.into_iter()
			.map(|(id, _)| (id, IdentType::Var(false))),
	);

	processed_scope_data
}
