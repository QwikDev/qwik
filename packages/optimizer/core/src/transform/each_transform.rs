use super::*;

const MAP_TO_EACH_DIRECTIVE: &str = "map-to-each";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EachCandidateWarning {
	MissingKey,
	UsesSecondParamForKey,
	CallDerivedKey,
	NotSingleJsxNode,
	UnsafeSlice,
	LocalFunctionReference,
	DynamicComponentReference,
}

#[derive(Clone)]
enum EachCallbackBody {
	Expr(Box<ast::Expr>),
	Block {
		stmts: Vec<ast::Stmt>,
		return_expr: Box<ast::Expr>,
	},
}

#[derive(Clone)]
struct EachCallbackInfo {
	params: Vec<ast::Pat>,
	second_param_ids: Vec<Id>,
	body: EachCallbackBody,
}

impl<'a> QwikTransform<'a> {
	fn push_each_candidate_warning(&mut self, span: Span, warning: EachCandidateWarning) {
		let (message, suggestion) = match warning {
			EachCandidateWarning::MissingKey => (
				"This .map() was not optimized to Each because the returned JSX node is missing a key.",
				"Add a stable key to the returned JSX node.",
			),
			EachCandidateWarning::UsesSecondParamForKey => (
				"This .map() was not optimized to Each because the key uses the callback's index parameter.",
				"Use a stable key derived from the item instead of the callback's index parameter.",
			),
			EachCandidateWarning::CallDerivedKey => (
				"This .map() was not optimized to Each because the key is derived from a function call.",
				"Use a stable key expression without function calls.",
			),
			EachCandidateWarning::NotSingleJsxNode => (
				"This .map() was not optimized to Each because the callback does not return a single JSX node.",
				"Return a single JSX node from the .map() callback.",
			),
			EachCandidateWarning::UnsafeSlice => (
				"This .map() was not optimized to Each because the callback body could not be safely sliced.",
				"Simplify the callback body so the key and rendered item can be derived independently.",
			),
			EachCandidateWarning::LocalFunctionReference => (
				"This .map() was not optimized to Each because the generated Each callback would capture a local function or class.",
				"Move the referenced function or component out of the parent scope, or keep the original .map() render loop.",
			),
			EachCandidateWarning::DynamicComponentReference => (
				"This .map() was not optimized to Each because the rendered component type depends on the callback item.",
				"Keep the original .map() render loop, or render a statically referenced component type.",
			),
		};
		self.diagnostics.push(Diagnostic {
			category: DiagnosticCategory::Warning,
			code: Some(MAP_TO_EACH_DIRECTIVE.to_string()),
			file: self
				.options
				.path_data
				.rel_path
				.to_slash_lossy()
				.to_string()
				.into(),
			message: message.into(),
			highlights: Some(vec![SourceLocation::from(&self.options.cm, span)]),
			suggestions: Some(vec![suggestion.into()]),
			scope: DiagnosticScope::Optimizer,
		});
	}

	fn analyze_each_callback(&self, expr: &ast::Expr) -> Option<EachCallbackInfo> {
		// Normalize arrow/function callbacks into one shape so the rewrite logic can
		// reason about params and the returned JSX without caring which syntax was used.
		match expr {
			ast::Expr::Arrow(arrow) => {
				let params = arrow.params.clone();
				let second_param_ids = params.get(1).map_or_else(Vec::new, collect_ids_from_pat);
				let body = match &*arrow.body {
					ast::BlockStmtOrExpr::Expr(expr) => EachCallbackBody::Expr(expr.clone()),
					ast::BlockStmtOrExpr::BlockStmt(block) => {
						let (last, prefix) = block.stmts.split_last()?;
						let ast::Stmt::Return(ast::ReturnStmt {
							arg: Some(return_expr),
							..
						}) = last
						else {
							return None;
						};
						EachCallbackBody::Block {
							stmts: prefix.to_vec(),
							return_expr: return_expr.clone(),
						}
					}
				};
				Some(EachCallbackInfo {
					params,
					second_param_ids,
					body,
				})
			}
			ast::Expr::Fn(fn_expr) => {
				let params: Vec<_> = fn_expr
					.function
					.params
					.iter()
					.map(|param| param.pat.clone())
					.collect();
				let second_param_ids = params.get(1).map_or_else(Vec::new, collect_ids_from_pat);
				let body = {
					let block = fn_expr.function.body.as_ref()?;
					let (last, prefix) = block.stmts.split_last()?;
					let ast::Stmt::Return(ast::ReturnStmt {
						arg: Some(return_expr),
						..
					}) = last
					else {
						return None;
					};
					EachCallbackBody::Block {
						stmts: prefix.to_vec(),
						return_expr: return_expr.clone(),
					}
				};
				Some(EachCallbackInfo {
					params,
					second_param_ids,
					body,
				})
			}
			_ => None,
		}
	}

	pub(super) fn try_rewrite_map_to_each(&mut self, node: &ast::CallExpr) -> Option<ast::Expr> {
		if self.jsx_children_expr_depth == 0 {
			return None;
		}

		let ast::Callee::Expr(box ast::Expr::Member(member)) = &node.callee else {
			return None;
		};
		let directive_span = if node.span.lo.0 == 0 {
			member.span
		} else {
			node.span
		};
		if self.has_disabled_optimizer_rule(directive_span, MAP_TO_EACH_DIRECTIVE) {
			return None;
		}
		if prop_to_string(&member.prop).as_deref() != Some("map") {
			return None;
		}

		let callback = node.args.first()?.expr.as_ref();
		let callback_info = match self.analyze_each_callback(callback) {
			Some(info) if !info.params.is_empty() => info,
			_ => return None,
		};

		let (return_expr, stmts) = match &callback_info.body {
			EachCallbackBody::Expr(expr) => (expr.as_ref(), None),
			EachCallbackBody::Block { stmts, return_expr } => (return_expr.as_ref(), Some(stmts)),
		};

		// Support both optimizer entry paths:
		// - raw JSX when `transpile_jsx` is false
		// - lowered `jsx/jsxs/jsxDEV(...)` calls when JSX was already transpiled by SWC
		let (key_expr, item_expr, raw_mode) = if let Some(jsx) = get_jsx_element_expr(return_expr) {
			let mut jsx = jsx.clone();
			let Some(key_expr) = remove_key_from_jsx_element(&mut jsx) else {
				self.push_each_candidate_warning(node.span, EachCandidateWarning::MissingKey);
				return None;
			};
			(
				Box::new(key_expr),
				Box::new(ast::Expr::JSXElement(Box::new(jsx))),
				true,
			)
		} else if let Some(call) = get_transpiled_jsx_call(return_expr, &self.jsx_functions) {
			let mut jsx_call = call.clone();
			let Some(key_expr) = remove_key_from_transpiled_jsx_call(&mut jsx_call) else {
				self.push_each_candidate_warning(node.span, EachCandidateWarning::MissingKey);
				return None;
			};
			(
				Box::new(key_expr),
				Box::new(ast::Expr::Call(jsx_call)),
				false,
			)
		} else if is_non_single_jsx_like(return_expr, &self.jsx_functions) {
			self.push_each_candidate_warning(node.span, EachCandidateWarning::NotSingleJsxNode);
			return None;
		} else {
			return None;
		};

		if contains_any_ident(key_expr.as_ref(), &callback_info.second_param_ids) {
			self.push_each_candidate_warning(
				node.span,
				EachCandidateWarning::UsesSecondParamForKey,
			);
			return None;
		}
		if expr_contains_call(key_expr.as_ref()) {
			self.push_each_candidate_warning(node.span, EachCandidateWarning::CallDerivedKey);
			return None;
		}
		if item_expr_has_dynamic_component_reference(
			item_expr.as_ref(),
			&callback_info.params,
			&self.jsx_functions,
		) {
			self.push_each_candidate_warning(
				node.span,
				EachCandidateWarning::DynamicComponentReference,
			);
			return None;
		}

		let key_fn_expr = match stmts {
			Some(stmts) => {
				// Build the minimal control-flow slice needed to compute the key. This
				// keeps us from blindly duplicating the whole callback prefix into `key$`.
				let key_stmts = match slice_statements_for_target(
					stmts,
					key_expr.as_ref(),
					&callback_info.second_param_ids,
					true,
				) {
					Ok(stmts) => stmts,
					Err(warning) => {
						self.push_each_candidate_warning(node.span, warning);
						return None;
					}
				};
				build_each_arrow_expr(&callback_info.params, Some(key_stmts), key_expr)
			}
			None => build_each_arrow_expr(&callback_info.params, None, key_expr),
		};

		let item_fn_expr = match stmts {
			Some(stmts) => {
				// Build the minimal slice needed to render the item body. Shared, simple
				// aliases can appear in both generated functions when both depend on them.
				let item_stmts =
					match slice_statements_for_target(stmts, item_expr.as_ref(), &[], false) {
						Ok(stmts) => stmts,
						Err(warning) => {
							self.push_each_candidate_warning(node.span, warning);
							return None;
						}
					};
				build_each_arrow_expr(&callback_info.params, Some(item_stmts), item_expr)
			}
			None => build_each_arrow_expr(&callback_info.params, None, item_expr),
		};

		// `item$` / `key$` become QRL-backed JSX props. If either generated callback would
		// capture a local function or class declaration from the parent scope, keep the
		// original `.map()` so we don't surface a later FunctionReference optimizer error.
		if self.has_invalid_qrl_function_reference(&key_fn_expr)
			|| self.has_invalid_qrl_function_reference(&item_fn_expr)
		{
			self.push_each_candidate_warning(
				directive_span,
				EachCandidateWarning::LocalFunctionReference,
			);
			return None;
		}

		let each_id = self.ensure_core_import(&Atom::from("Each"));
		let replacement = if raw_mode {
			build_each_jsx_element(
				&each_id,
				member.obj.as_ref().clone(),
				key_fn_expr,
				item_fn_expr,
			)
		} else {
			let template = get_transpiled_jsx_call(return_expr, &self.jsx_functions)
				.expect("checked transpiled jsx call");
			build_each_transpiled_call(
				template,
				&each_id,
				member.obj.as_ref().clone(),
				key_fn_expr,
				item_fn_expr,
			)
		};

		Some(replacement.fold_with(self))
	}
}

fn collect_ids_from_pat(pat: &ast::Pat) -> Vec<Id> {
	let mut identifiers = Vec::new();
	collect_from_pat(pat, &mut identifiers);
	identifiers.into_iter().map(|(id, _)| id).collect()
}

fn collect_expr_used_idents(expr: &ast::Expr) -> HashSet<Id> {
	let mut collector = IdentCollector::new();
	expr.visit_with(&mut collector);
	collector.get_words().into_iter().collect()
}

fn collect_stmt_used_idents(stmt: &ast::Stmt) -> HashSet<Id> {
	let mut collector = AnyIdentCollector::new();
	stmt.visit_with(&mut collector);
	collector.local_idents
}

struct DefinedIdCollector {
	defines: HashSet<Id>,
}

impl DefinedIdCollector {
	fn new() -> Self {
		Self {
			defines: HashSet::new(),
		}
	}
}

impl Visit for DefinedIdCollector {
	noop_visit_type!();

	fn visit_var_declarator(&mut self, node: &ast::VarDeclarator) {
		let mut identifiers = Vec::new();
		collect_from_pat(&node.name, &mut identifiers);
		self.defines
			.extend(identifiers.into_iter().map(|(id, _)| id));
		node.visit_children_with(self);
	}

	fn visit_assign_expr(&mut self, node: &ast::AssignExpr) {
		match &node.left {
			ast::AssignTarget::Simple(simple) => match simple {
				ast::SimpleAssignTarget::Ident(ident) => {
					self.defines.insert(id!(&ident.id));
				}
				ast::SimpleAssignTarget::Paren(paren) => {
					paren.visit_children_with(self);
				}
				_ => {}
			},
			ast::AssignTarget::Pat(pat) => {
				pat.visit_children_with(self);
			}
		}
		node.visit_children_with(self);
	}

	fn visit_update_expr(&mut self, node: &ast::UpdateExpr) {
		if let ast::Expr::Ident(ident) = &*node.arg {
			self.defines.insert(id!(ident));
		}
		node.visit_children_with(self);
	}
}

fn collect_stmt_defined_idents(stmt: &ast::Stmt) -> HashSet<Id> {
	let mut collector = DefinedIdCollector::new();
	stmt.visit_with(&mut collector);
	collector.defines
}

struct DeclaredIdCollector {
	declared: HashSet<Id>,
}

impl DeclaredIdCollector {
	fn new() -> Self {
		Self {
			declared: HashSet::new(),
		}
	}
}

impl Visit for DeclaredIdCollector {
	noop_visit_type!();

	fn visit_var_declarator(&mut self, node: &ast::VarDeclarator) {
		let mut identifiers = Vec::new();
		collect_from_pat(&node.name, &mut identifiers);
		self.declared
			.extend(identifiers.into_iter().map(|(id, _)| id));
		node.visit_children_with(self);
	}

	fn visit_fn_decl(&mut self, node: &ast::FnDecl) {
		self.declared.insert(id!(&node.ident));
		node.visit_children_with(self);
	}

	fn visit_class_decl(&mut self, node: &ast::ClassDecl) {
		self.declared.insert(id!(&node.ident));
		node.visit_children_with(self);
	}
}

fn collect_stmt_declared_idents(stmt: &ast::Stmt) -> HashSet<Id> {
	let mut collector = DeclaredIdCollector::new();
	stmt.visit_with(&mut collector);
	collector.declared
}

fn stmt_uses_any_ident(stmt: &ast::Stmt, ids: &[Id]) -> bool {
	ids.iter().any(|id| {
		let mut checker = StatementIdentChecker {
			target_id: id.clone(),
			found: false,
		};
		stmt.visit_with(&mut checker);
		checker.found
	})
}

fn contains_any_ident(expr: &ast::Expr, ids: &[Id]) -> bool {
	ids.iter().any(|id| expr_uses_ident(expr, id))
}

struct StatementIdentChecker {
	target_id: Id,
	found: bool,
}

impl Visit for StatementIdentChecker {
	noop_visit_type!();

	fn visit_ident(&mut self, ident: &ast::Ident) {
		if id!(ident) == self.target_id {
			self.found = true;
		}
	}
}

struct CallExprChecker {
	found: bool,
}

impl Visit for CallExprChecker {
	noop_visit_type!();

	fn visit_call_expr(&mut self, _: &ast::CallExpr) {
		self.found = true;
	}

	fn visit_opt_chain_expr(&mut self, node: &ast::OptChainExpr) {
		if matches!(*node.base, ast::OptChainBase::Call(_)) {
			self.found = true;
		}
		node.visit_children_with(self);
	}
}

fn expr_contains_call(expr: &ast::Expr) -> bool {
	let mut checker = CallExprChecker { found: false };
	expr.visit_with(&mut checker);
	checker.found
}

fn stmt_contains_call(stmt: &ast::Stmt) -> bool {
	let mut checker = CallExprChecker { found: false };
	stmt.visit_with(&mut checker);
	checker.found
}

fn collect_declared_ids_from_stmts(stmts: &[ast::Stmt]) -> HashSet<Id> {
	let mut out = HashSet::new();
	for stmt in stmts {
		out.extend(collect_stmt_defined_idents(stmt));
	}
	out
}

fn slice_statements_for_target(
	stmts: &[ast::Stmt],
	target_expr: &ast::Expr,
	second_param_ids: &[Id],
	is_key_slice: bool,
) -> Result<Vec<ast::Stmt>, EachCandidateWarning> {
	// Walk backwards from the final expression, pulling in only statements that define
	// values still needed by that expression. This lets `key$` and `item$` preserve
	// relevant branches/loops independently instead of copying the entire callback body.
	let mut needed = collect_expr_used_idents(target_expr);
	let local_declared = collect_declared_ids_from_stmts(stmts);
	let mut selected = Vec::new();

	for stmt in stmts.iter().rev() {
		let defines = collect_stmt_defined_idents(stmt);
		let declared = collect_stmt_declared_idents(stmt);
		if defines.is_empty() || defines.is_disjoint(&needed) {
			continue;
		}
		let contains_call = stmt_contains_call(stmt);
		let uses_second_param = stmt_uses_any_ident(stmt, second_param_ids);
		if is_key_slice && (contains_call || uses_second_param) {
			return Err(if contains_call {
				EachCandidateWarning::CallDerivedKey
			} else {
				EachCandidateWarning::UsesSecondParamForKey
			});
		}

		let mut uses = collect_stmt_used_idents(stmt);
		for defined in &defines {
			needed.remove(defined);
			if declared.contains(defined) {
				uses.remove(defined);
			}
		}
		needed.extend(uses);
		selected.push(stmt.clone());
	}

	if needed.iter().any(|id| local_declared.contains(id)) {
		return Err(EachCandidateWarning::UnsafeSlice);
	}

	selected.reverse();
	Ok(selected)
}

fn get_jsx_element_expr(expr: &ast::Expr) -> Option<&ast::JSXElement> {
	match expr {
		ast::Expr::Paren(paren) => get_jsx_element_expr(&paren.expr),
		ast::Expr::JSXElement(element) => Some(element),
		_ => None,
	}
}

fn get_transpiled_jsx_call<'a>(
	expr: &'a ast::Expr,
	jsx_functions: &HashSet<Id>,
) -> Option<&'a ast::CallExpr> {
	match expr {
		ast::Expr::Paren(paren) => get_transpiled_jsx_call(&paren.expr, jsx_functions),
		ast::Expr::Call(call) => {
			let ast::Callee::Expr(box ast::Expr::Ident(ident)) = &call.callee else {
				return None;
			};
			jsx_functions.contains(&id!(ident)).then_some(call)
		}
		_ => None,
	}
}

fn is_non_single_jsx_like(expr: &ast::Expr, jsx_functions: &HashSet<Id>) -> bool {
	match expr {
		ast::Expr::Paren(paren) => is_non_single_jsx_like(&paren.expr, jsx_functions),
		ast::Expr::JSXFragment(_) | ast::Expr::Array(_) => true,
		ast::Expr::Call(call) => {
			let ast::Callee::Expr(box ast::Expr::Ident(ident)) = &call.callee else {
				return false;
			};
			jsx_functions.contains(&id!(ident))
		}
		_ => false,
	}
}

fn remove_key_from_jsx_element(element: &mut ast::JSXElement) -> Option<ast::Expr> {
	let key_index = element.opening.attrs.iter().position(|attr| {
		matches!(
			attr,
			ast::JSXAttrOrSpread::JSXAttr(ast::JSXAttr {
				name: ast::JSXAttrName::Ident(ident),
				..
			}) if ident.sym == *"key"
		)
	})?;
	let ast::JSXAttrOrSpread::JSXAttr(attr) = element.opening.attrs.remove(key_index) else {
		return None;
	};
	match attr.value {
		Some(ast::JSXAttrValue::Lit(ast::Lit::Str(str))) => {
			Some(ast::Expr::Lit(ast::Lit::Str(str)))
		}
		Some(ast::JSXAttrValue::JSXExprContainer(container)) => match container.expr {
			ast::JSXExpr::Expr(expr) => Some(*expr),
			ast::JSXExpr::JSXEmptyExpr(_) => None,
		},
		_ => None,
	}
}

fn remove_key_from_transpiled_jsx_call(call: &mut ast::CallExpr) -> Option<ast::Expr> {
	if call.args.len() < 3 {
		return None;
	}
	// SWC's automatic JSX runtime lowers `<div key={x} />` to `jsx(type, props, key, ...)`,
	// so the key lives outside the props object and must be cleared from arg slot 2.
	let key_expr = (*call.args[2].expr).clone();
	call.args[2] = get_null_arg();
	Some(key_expr)
}

fn build_each_arrow_expr(
	params: &[ast::Pat],
	stmts: Option<Vec<ast::Stmt>>,
	return_expr: Box<ast::Expr>,
) -> ast::Expr {
	let params = params.to_vec();
	match stmts {
		Some(mut stmts) => {
			stmts.push(ast::Stmt::Return(ast::ReturnStmt {
				span: DUMMY_SP,
				arg: Some(return_expr),
			}));
			ast::Expr::Arrow(ast::ArrowExpr {
				span: DUMMY_SP,
				ctxt: SyntaxContext::empty(),
				params,
				body: Box::new(ast::BlockStmtOrExpr::BlockStmt(ast::BlockStmt {
					span: DUMMY_SP,
					ctxt: SyntaxContext::empty(),
					stmts,
				})),
				is_async: false,
				is_generator: false,
				type_params: None,
				return_type: None,
			})
		}
		None => ast::Expr::Arrow(ast::ArrowExpr {
			span: DUMMY_SP,
			ctxt: SyntaxContext::empty(),
			params,
			body: Box::new(ast::BlockStmtOrExpr::Expr(return_expr)),
			is_async: false,
			is_generator: false,
			type_params: None,
			return_type: None,
		}),
	}
}

fn build_each_jsx_attr(name: &str, expr: ast::Expr) -> ast::JSXAttrOrSpread {
	ast::JSXAttrOrSpread::JSXAttr(ast::JSXAttr {
		span: DUMMY_SP,
		name: ast::JSXAttrName::Ident(ast::IdentName::new(name.into(), DUMMY_SP)),
		value: Some(ast::JSXAttrValue::JSXExprContainer(ast::JSXExprContainer {
			span: DUMMY_SP,
			expr: ast::JSXExpr::Expr(Box::new(expr)),
		})),
	})
}

fn build_each_jsx_element(
	each_id: &Id,
	items_expr: ast::Expr,
	key_expr: ast::Expr,
	item_expr: ast::Expr,
) -> ast::Expr {
	ast::Expr::JSXElement(Box::new(ast::JSXElement {
		span: DUMMY_SP,
		opening: ast::JSXOpeningElement {
			name: ast::JSXElementName::Ident(ast::Ident::new(
				each_id.0.clone(),
				DUMMY_SP,
				each_id.1,
			)),
			span: DUMMY_SP,
			attrs: vec![
				build_each_jsx_attr("items", items_expr),
				build_each_jsx_attr("key$", key_expr),
				build_each_jsx_attr("item$", item_expr),
			],
			self_closing: true,
			type_args: None,
		},
		children: vec![],
		closing: None,
	}))
}

fn build_each_prop(name: &str, expr: ast::Expr) -> ast::PropOrSpread {
	ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
		key: ast::PropName::Ident(ast::IdentName::new(name.into(), DUMMY_SP)),
		value: Box::new(expr),
	})))
}

fn build_each_transpiled_call(
	template: &ast::CallExpr,
	each_id: &Id,
	items_expr: ast::Expr,
	key_expr: ast::Expr,
	item_expr: ast::Expr,
) -> ast::Expr {
	let mut args = vec![
		ast::ExprOrSpread {
			spread: None,
			expr: Box::new(ast::Expr::Ident(new_ident_from_id(each_id))),
		},
		ast::ExprOrSpread {
			spread: None,
			expr: Box::new(ast::Expr::Object(ast::ObjectLit {
				span: DUMMY_SP,
				props: vec![
					build_each_prop("items", items_expr),
					build_each_prop("key$", key_expr),
					build_each_prop("item$", item_expr),
				],
			})),
		},
		get_null_arg(),
	];
	// Preserve any extra runtime arguments (for example dev-location metadata) from the
	// original lowered JSX call so the surrounding optimizer pipeline keeps behaving the same.
	args.extend(template.args.iter().skip(3).cloned());
	ast::Expr::Call(ast::CallExpr {
		callee: template.callee.clone(),
		args,
		..template.clone()
	})
}

fn item_expr_has_dynamic_component_reference(
	expr: &ast::Expr,
	params: &[ast::Pat],
	jsx_functions: &HashSet<Id>,
) -> bool {
	let param_ids: Vec<_> = params.iter().flat_map(collect_ids_from_pat).collect();
	if param_ids.is_empty() {
		return false;
	}

	let mut checker = DynamicComponentReferenceChecker {
		param_ids: &param_ids,
		jsx_functions,
		found: false,
	};
	expr.visit_with(&mut checker);
	checker.found
}

struct DynamicComponentReferenceChecker<'a> {
	param_ids: &'a [Id],
	jsx_functions: &'a HashSet<Id>,
	found: bool,
}

impl Visit for DynamicComponentReferenceChecker<'_> {
	noop_visit_type!();

	fn visit_jsx_opening_element(&mut self, node: &ast::JSXOpeningElement) {
		if jsx_element_name_uses_any_ident(&node.name, self.param_ids) {
			self.found = true;
			return;
		}
		node.visit_children_with(self);
	}

	fn visit_call_expr(&mut self, node: &ast::CallExpr) {
		let ast::Callee::Expr(box ast::Expr::Ident(ident)) = &node.callee else {
			node.visit_children_with(self);
			return;
		};

		if self.jsx_functions.contains(&id!(ident))
			&& node
				.args
				.first()
				.is_some_and(|arg| match arg.expr.as_ref() {
					ast::Expr::Lit(ast::Lit::Str(_)) => false,
					expr => contains_any_ident(expr, self.param_ids),
				}) {
			self.found = true;
			return;
		}

		node.visit_children_with(self);
	}
}

fn jsx_element_name_uses_any_ident(name: &ast::JSXElementName, ids: &[Id]) -> bool {
	match name {
		ast::JSXElementName::Ident(ident) => ids.iter().any(|id| id!(ident) == *id),
		ast::JSXElementName::JSXMemberExpr(member) => jsx_member_expr_uses_any_ident(member, ids),
		ast::JSXElementName::JSXNamespacedName(_) => false,
	}
}

fn jsx_member_expr_uses_any_ident(member: &ast::JSXMemberExpr, ids: &[Id]) -> bool {
	match &member.obj {
		ast::JSXObject::Ident(ident) => ids.iter().any(|id| id!(ident) == *id),
		ast::JSXObject::JSXMemberExpr(member) => jsx_member_expr_uses_any_ident(member, ids),
	}
}
