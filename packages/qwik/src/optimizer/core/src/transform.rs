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
use swc_common::{errors::HANDLER, sync::Lrc, SourceMap, Span, Spanned, DUMMY_SP};
use swc_ecmascript::ast::{self, SpreadElement};
use swc_ecmascript::utils::{private_ident, quote_ident, ExprFactory};
use swc_ecmascript::visit::{noop_fold_type, Fold, FoldWith, VisitWith};

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
}

#[derive(Debug, Clone)]
pub struct SegmentData {
	pub extension: Atom,
	pub local_idents: Vec<Id>,
	pub scoped_idents: Vec<Id>,
	pub parent_segment: Option<Atom>,
	pub ctx_kind: SegmentKind,
	pub ctx_name: Atom,
	pub origin: Atom,
	pub path: Atom,
	pub display_name: Atom,
	pub hash: Atom,
	pub need_transform: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum IdentType {
	Var(bool),
	Fn,
	Class,
}

pub type IdPlusType = (Id, IdentType);

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

	jsx_mutable: bool,

	segment_stack: Vec<Atom>,
	file_hash: u64,
	jsx_key_counter: u32,
	root_jsx_mode: bool,
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

		for id in options.global_collect.exports.keys() {
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
			marker_functions,
			jsx_functions,
			immutable_function_cmp,
			root_jsx_mode: true,
			jsx_mutable: false,
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

	fn register_context_name(&mut self, custom_symbol: Option<Atom>) -> (Atom, Atom, Atom, u64) {
		if let Some(custom_symbol) = custom_symbol {
			return (
				custom_symbol.clone(),
				custom_symbol.clone(),
				custom_symbol,
				0,
			);
		}
		let mut display_name = self.stack_ctxt.join("_");
		if self.stack_ctxt.is_empty() {
			display_name += "s_";
		}
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
		let local_file_name = self.options.path_data.rel_path.to_slash_lossy();
		if let Some(scope) = self.options.scope {
			hasher.write(scope.as_bytes());
		}
		hasher.write(local_file_name.as_bytes());
		hasher.write(display_name.as_bytes());
		let hash = hasher.finish();
		let hash64 = base64(hash);

		let symbol_name = if matches!(self.options.mode, EmitMode::Dev | EmitMode::Test) {
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

	/** Parse inlinedQrl() (from library code) */
	fn handle_inlined_qsegment(&mut self, mut node: ast::CallExpr) -> ast::CallExpr {
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
				_ => panic!("dfd"),
			};
			parse_symbol_name(
				symbol_name,
				matches!(self.options.mode, EmitMode::Dev | EmitMode::Test),
				&self.options.path_data.file_name,
			)
		};

		self.segment_stack.push(symbol_name.clone());
		let folded = *first_arg.expr.fold_with(self);
		self.segment_stack.pop();

		let scoped_idents = {
			third_arg.map_or_else(Vec::new, |scoped| {
				let list: Vec<Id> = match &*scoped.expr {
					ast::Expr::Array(array) => array
						.elems
						.iter()
						.flat_map(|item| match &*item.as_ref().unwrap().expr {
							ast::Expr::Ident(ident) => Some(id!(ident)),
							_ => None,
						})
						.collect(),
					_ => vec![],
				};
				list
			})
		};
		let local_idents = self.get_local_idents(&folded);
		let segment_data = SegmentData {
			extension: self.options.extension.clone(),
			local_idents,
			scoped_idents,
			parent_segment: self.segment_stack.last().cloned(),
			ctx_kind,
			ctx_name,
			origin: self.options.path_data.rel_path.to_slash_lossy().into(),
			path: self.options.path_data.rel_dir.to_slash_lossy().into(),
			display_name,
			need_transform: false,
			hash,
		};
		let should_emit = self.should_emit_segment(&segment_data);
		if should_emit {
			for id in &segment_data.local_idents {
				if !self.options.global_collect.exports.contains_key(id)
					&& self.options.global_collect.root.contains_key(id)
				{
					self.ensure_export(id);
				}
			}
		}
		if !should_emit {
			self.create_noop_qrl(&symbol_name, segment_data)
		} else if self.is_inline() {
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
		let can_capture = can_capture_scope(&first_arg);
		let first_arg_span = first_arg.span();

		let (symbol_name, display_name, hash, segment_hash) =
			self.register_context_name(custom_symbol);

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

		let (mut scoped_idents, is_const) =
			compute_scoped_idents(&descendent_idents, &decl_collect);
		if !can_capture && !scoped_idents.is_empty() {
			HANDLER.with(|handler| {
				let ids: Vec<_> = scoped_idents.iter().map(|id| id.0.as_ref()).collect();
				handler
					.struct_span_err_with_code(
						first_arg_span,
						&format!("Qrl($) scope is not a function, but it's capturing local identifiers: {}", ids.join(", ")),
						errors::get_diagnostic_id(errors::Error::CanNotCapture),
					)
					.emit();
			});
			scoped_idents = vec![];
		}
		let segment_data = SegmentData {
			extension: self.options.extension.clone(),
			local_idents,
			scoped_idents,
			parent_segment: self.segment_stack.last().cloned(),
			ctx_kind,
			ctx_name,
			origin: self.options.path_data.rel_path.to_slash_lossy().into(),
			path: self.options.path_data.rel_dir.to_slash_lossy().into(),
			display_name,
			need_transform: true,
			hash,
		};
		let should_emit = self.should_emit_segment(&segment_data);
		if should_emit {
			for id in &segment_data.local_idents {
				if !self.options.global_collect.exports.contains_key(id) {
					if self.options.global_collect.root.contains_key(id) {
						self.ensure_export(id);
					}
					if invalid_decl.iter().any(|entry| entry.0 == *id) {
						HANDLER.with(|handler| {
							handler
								.struct_err_with_code(
									&format!(
										"Reference to identifier '{}' can not be used inside a Qrl($) scope because it's a function",
										id.0
									),
									errors::get_diagnostic_id(errors::Error::FunctionReference),
								)
								.emit();
						});
					}
				}
			}
		}
		if !should_emit {
			(self.create_noop_qrl(&symbol_name, segment_data), is_const)
		} else if self.is_inline() {
			let folded = if !segment_data.scoped_idents.is_empty() {
				let new_local = self.ensure_core_import(&USE_LEXICAL_SCOPE);
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

		let mut idents = collector.get_words();
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
		if self.options.mode == EmitMode::Dev {
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
					Some(ast::JSXAttrValue::JSXExprContainer(ast::JSXExprContainer {
						span: DUMMY_SP,
						expr: ast::JSXExpr::Expr(Box::new(ast::Expr::Call(
							self.create_synthetic_qsegment(
								*expr,
								SegmentKind::JSXProp,
								ctx_name,
								None,
							),
						))),
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
		let exported_name: Option<Atom> = Some(format!("_auto_{}", id.0).into());
		if self
			.options
			.global_collect
			.add_export(id.clone(), exported_name.clone())
		{
			self.extra_bottom_items
				.insert(id.clone(), create_synthetic_named_export(id, exported_name));
		}
	}

	fn create_qrl(
		&mut self,
		path: Atom,
		symbol: &str,
		segment_data: &SegmentData,
		span: &Span,
	) -> ast::CallExpr {
		// Put the QRL import function in module scope
		let import_fn_name = private_ident!(format!("i_{}", segment_data.hash));
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
							value: path,
							raw: None,
						}))),
					}],
					..Default::default()
				},
			)))),
			..Default::default()
		});
		self.extra_top_items.insert(
			id!(import_fn_name),
			ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(Box::new(ast::VarDecl {
				kind: ast::VarDeclKind::Const,
				decls: vec![ast::VarDeclarator {
					name: ast::Pat::Ident(ast::BindingIdent::from(import_fn_name.clone())),
					init: Some(Box::new(import_fn)),
					definite: false,
					span: DUMMY_SP,
				}],
				..Default::default()
			})))),
		);

		// Create the qrl arguments
		let mut args = vec![
			ast::Expr::Ident(import_fn_name),
			ast::Expr::Lit(ast::Lit::Str(ast::Str {
				span: DUMMY_SP,
				value: symbol.into(),
				raw: None,
			})),
		];
		let fn_callee = if self.options.mode == EmitMode::Dev {
			args.push(get_qrl_dev_obj(
				Atom::from(
					self.options
						.dev_path
						.unwrap_or(&self.options.path_data.abs_path.to_slash_lossy()),
				),
				segment_data,
				span,
			));
			_QRL_DEV.clone()
		} else {
			_QRL.clone()
		};

		// Injects state
		if !segment_data.scoped_idents.is_empty() {
			args.push(ast::Expr::Array(ast::ArrayLit {
				span: DUMMY_SP,
				elems: segment_data
					.scoped_idents
					.iter()
					.map(|id| {
						Some(ast::ExprOrSpread {
							spread: None,
							expr: Box::new(ast::Expr::Ident(new_ident_from_id(id))),
						})
					})
					.collect(),
			}))
		}

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
			|| matches!(expr, ast::Expr::Ident(_));
		let param_names = Self::extract_param_names(&expr);
		let inlined_expr = if should_inline {
			expr
		} else {
			let new_ident = private_ident!(symbol_name.clone());
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

		let fn_callee = if self.options.mode == EmitMode::Dev {
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

		// Injects state
		if !segment_data.scoped_idents.is_empty() {
			args.push(ast::Expr::Array(ast::ArrayLit {
				span: DUMMY_SP,
				elems: segment_data
					.scoped_idents
					.iter()
					.map(|id| {
						Some(ast::ExprOrSpread {
							spread: None,
							expr: Box::new(ast::Expr::Ident(new_ident_from_id(id))),
						})
					})
					.collect(),
			}))
		}

		self.create_internal_call(&fn_callee, args, true)
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
				let should_runtime_sort = has_spread_props;
				let mut static_listeners = !has_spread_props;
				let mut static_subtree = !has_spread_props;

				for prop in props.into_iter() {
					let mut name_token = false;
					// If we have spread props, all the props that come before it are variable even if they're static
					let maybe_const_props = if spread_props_count > 0 {
						&mut var_props
					} else {
						&mut const_props
					};
					match prop {
						// regular props
						ast::PropOrSpread::Prop(box ast::Prop::KeyValue(ref node)) => {
							let key_word = match node.key {
								ast::PropName::Ident(ref ident) => Some(ident.sym.clone()),
								ast::PropName::Str(ref s) => Some(s.value.clone()),
								_ => None,
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
												key: node.key.clone(),
												value: transformed_children,
											}),
										)));
									} else {
										children = Some(transformed_children);
									}
								} else if !is_fn && (key_word == *REF || key_word == *QSLOT) {
									// skip
									var_props.push(prop.fold_with(self));
								} else if convert_qrl_word(&key_word).is_some() {
									if matches!(*node.value, ast::Expr::Arrow(_) | ast::Expr::Fn(_))
									{
										let (converted_expr, is_const) = self
											._create_synthetic_qsegment(
												*node.value.clone(),
												if is_fn {
													SegmentKind::JSXProp
												} else {
													SegmentKind::EventHandler
												},
												key_word.clone(),
												None,
											);

										let converted_prop = ast::PropOrSpread::Prop(Box::new(
											ast::Prop::KeyValue(ast::KeyValueProp {
												value: Box::new(ast::Expr::Call(converted_expr)),
												key: node.key.clone(),
											}),
										));
										if !is_const {
											static_listeners = false;
										}

										if is_fn || spread_props_count > 0 {
											if is_const {
												maybe_const_props
													.push(converted_prop.fold_with(self));
											} else {
												var_props.push(converted_prop.fold_with(self));
											}
										} else if !is_const || spread_props_count > 0 {
											var_props.push(converted_prop.fold_with(self));
										} else {
											const_props.push(converted_prop.fold_with(self));
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

										if is_fn || spread_props_count > 0 {
											if const_prop {
												maybe_const_props.push(prop.fold_with(self));
											} else {
												var_props.push(prop.fold_with(self));
											}
										} else if !const_prop || spread_props_count > 0 {
											var_props.push(prop.fold_with(self));
										} else {
											const_props.push(prop.fold_with(self));
										}
									}
								} else if is_const_expr(
									&node.value,
									&self.options.global_collect,
									Some(&const_idents),
								) {
									maybe_const_props.push(prop.fold_with(self));
								} else if let Some((getter, is_const)) =
									self.convert_to_getter(&node.value)
								{
									let key = node.key.clone();
									let entry: ast::PropOrSpread = ast::PropOrSpread::Prop(
										Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
											key,
											value: Box::new(getter),
										})),
									);
									if is_fn || is_const {
										maybe_const_props.push(entry);
									} else {
										var_props.push(entry);
									}
								} else {
									var_props.push(prop.fold_with(self));
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

	/// Convert an expression to a QRL or a getter. Returns (expr, isConst)
	/// This is needed to make sure signals aren't read unless they're used by the component
	fn convert_to_getter(&mut self, expr: &ast::Expr) -> Option<(ast::Expr, bool)> {
		let (inlined_expr, is_const) = self.create_synthetic_qqsegment(expr.clone(), true);
		if let Some(expr) = inlined_expr {
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

	// TODO export segment data for the noop qrl
	fn create_noop_qrl(
		&mut self,
		symbol_name: &swc_atoms::Atom,
		segment_data: SegmentData,
	) -> ast::CallExpr {
		let mut args = vec![ast::Expr::Lit(ast::Lit::Str(ast::Str {
			span: DUMMY_SP,
			value: symbol_name.clone(),
			raw: None,
		}))];

		let mut fn_name: &Atom = &_NOOP_QRL;
		if self.options.mode == EmitMode::Dev {
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

		// Injects state
		if !segment_data.scoped_idents.is_empty() {
			args.push(ast::Expr::Array(ast::ArrayLit {
				span: DUMMY_SP,
				elems: segment_data
					.scoped_idents
					.iter()
					.map(|id| {
						Some(ast::ExprOrSpread {
							spread: None,
							expr: Box::new(ast::Expr::Ident(new_ident_from_id(id))),
						})
					})
					.collect(),
			}))
		}
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
}

impl<'a> Fold for QwikTransform<'a> {
	noop_fold_type!();

	fn fold_module(&mut self, node: ast::Module) -> ast::Module {
		let mut body = Vec::with_capacity(node.body.len() + 10);
		let mut module_body = node
			.body
			.into_iter()
			.flat_map(|i| {
				let module_item = i.fold_with(self);
				let output: Vec<_> = if matches!(self.options.entry_strategy, EntryStrategy::Hoist)
				{
					self.segments
						.drain(..)
						.map(|segment| {
							let id = (
								segment.name.clone(),
								SyntaxContext::from_u32(segment.hash as u32),
							);
							ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(Box::new(
								ast::VarDecl {
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
								},
							))))
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
		body.extend(self.extra_top_items.values().cloned());
		body.append(&mut module_body);
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
		node.fold_children_with(self)
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
		let o = node.fold_children_with(self);
		self.root_jsx_mode = prev;
		self.jsx_mutable = prev_jsx_mutable;
		self.decl_stack.pop();

		o
	}

	fn fold_arrow_expr(&mut self, node: ast::ArrowExpr) -> ast::ArrowExpr {
		self.decl_stack.push(vec![]);
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

		let o = node.fold_children_with(self);
		self.root_jsx_mode = prev;
		self.jsx_mutable = prev_jsx_mutable;
		self.decl_stack.pop();

		o
	}

	fn fold_for_stmt(&mut self, node: ast::ForStmt) -> ast::ForStmt {
		self.decl_stack.push(vec![]);
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;
		let o = node.fold_children_with(self);
		self.root_jsx_mode = prev;
		self.decl_stack.pop();

		o
	}

	fn fold_for_in_stmt(&mut self, node: ast::ForInStmt) -> ast::ForInStmt {
		self.decl_stack.push(vec![]);
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;
		let o = node.fold_children_with(self);
		self.root_jsx_mode = prev;
		self.decl_stack.pop();

		o
	}

	fn fold_for_of_stmt(&mut self, node: ast::ForOfStmt) -> ast::ForOfStmt {
		self.decl_stack.push(vec![]);
		let prev = self.root_jsx_mode;
		self.root_jsx_mode = true;

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

		let o = node.fold_children_with(self);
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
		let stacked = if let ast::JSXElementName::Ident(ref ident) = node.opening.name {
			self.stack_ctxt.push(ident.sym.to_string());
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
				self.stack_ctxt.push(ident.sym.to_string());

				if new_word.is_some() {
					ast::JSXAttr {
						value: self.handle_jsx_value(ident.sym.clone(), node.value),
						..node
					}
				} else {
					node
				}
			}
			ast::JSXAttrName::JSXNamespacedName(ref namespaced) => {
				let new_word = convert_qrl_word(&namespaced.name.sym);
				let ident_name = [
					namespaced.ns.sym.as_ref(),
					"-",
					namespaced.name.sym.as_ref(),
				]
				.concat();
				self.stack_ctxt.push(ident_name.clone());
				if new_word.is_some() {
					ast::JSXAttr {
						value: self.handle_jsx_value(Atom::from(ident_name), node.value),
						..node
					}
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

		if let ast::Callee::Expr(box ast::Expr::Ident(ident)) = &node.callee {
			if id_eq!(ident, &self.sync_qrl_fn) {
				return self.handle_sync_qrl(node);
			} else if id_eq!(ident, &self.qsegment_fn) {
				if let Some(comments) = self.options.comments {
					comments.add_pure_comment(ident.span.lo);
				}
				return self.handle_qsegment(node);
			} else if self.jsx_functions.contains(&id!(ident)) {
				return self.handle_jsx(node);
			} else if id_eq!(ident, &self.inlined_qrl_fn) {
				return self.handle_inlined_qsegment(node);
			} else if let Some(specifier) = self.marker_functions.get(&id!(ident)) {
				self.stack_ctxt.push(ident.sym.to_string());
				ctx_name = specifier.clone();
				name_token = true;

				if id_eq!(ident, &self.qcomponent_fn) {
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
					global_collect
							.exports
							.keys()
							.find(|id| id.0 == new_specifier)
							.map_or_else(
								|| {
									HANDLER.with(|handler| {
										handler
											.struct_span_err_with_code(
												ident.span,
												&format!("Found '{}' but did not find the corresponding '{}' exported in the same file. Please check that it is exported and spelled correctly", &ident.sym, &new_specifier),
												errors::get_diagnostic_id(errors::Error::MissingQrlImplementation),
										)
											.emit();
									});
								},
								|new_local| {
									replace_callee = Some(new_ident_from_id(new_local).as_callee());
								},
							);
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
					ast::ExprOrSpread {
						expr: Box::new(ast::Expr::Call(self.create_synthetic_qsegment(
							*arg.expr,
							SegmentKind::Function,
							ctx_name.clone(),
							None,
						)))
						.fold_with(self),
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
		ast::CallExpr {
			callee,
			args,
			..node
		}
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

const fn can_capture_scope(expr: &ast::Expr) -> bool {
	matches!(expr, &ast::Expr::Fn(_) | &ast::Expr::Arrow(_))
}

fn base64(nu: u64) -> String {
	base64::engine::general_purpose::URL_SAFE_NO_PAD
		.encode(nu.to_le_bytes())
		.replace(['-', '_'], "0")
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
