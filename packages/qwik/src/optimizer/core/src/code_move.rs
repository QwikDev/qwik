use crate::collector::{
	collect_from_pat, new_ident_from_id, GlobalCollect, Id, Import, ImportKind,
};
use crate::parse::PathData;
use crate::transform::create_synthetic_named_import;
use crate::words::*;

use anyhow::Error;
use indexmap::IndexMap;
use std::collections::{BTreeMap, HashMap, HashSet};
use swc_atoms::Atom;
use swc_common::comments::{SingleThreadedComments, SingleThreadedCommentsMap};
use swc_common::Spanned;
use swc_common::DUMMY_SP;
use swc_ecmascript::ast;
use swc_ecmascript::utils::private_ident;
use swc_ecmascript::visit::{noop_visit_type, Fold, FoldWith, Visit, VisitWith};

macro_rules! id {
	($ident: expr) => {
		($ident.sym.clone(), $ident.ctxt)
	};
}

/// Shared helper to build an ImportDecl from an Import and local Id
fn build_import_decl(import: &Import, local_id: &Id) -> ast::ModuleItem {
	let specifier = match import.kind {
		ImportKind::Named => ast::ImportSpecifier::Named(ast::ImportNamedSpecifier {
			is_type_only: false,
			span: DUMMY_SP,
			imported: if import.specifier == local_id.0 {
				None
			} else {
				Some(ast::ModuleExportName::Ident(ast::Ident::new(
					import.specifier.clone(),
					DUMMY_SP,
					Default::default(),
				)))
			},
			local: new_ident_from_id(local_id),
		}),
		ImportKind::Default => ast::ImportSpecifier::Default(ast::ImportDefaultSpecifier {
			span: DUMMY_SP,
			local: new_ident_from_id(local_id),
		}),
		ImportKind::All => ast::ImportSpecifier::Namespace(ast::ImportStarAsSpecifier {
			span: DUMMY_SP,
			local: new_ident_from_id(local_id),
		}),
	};

	ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(ast::ImportDecl {
		span: DUMMY_SP,
		type_only: false,
		with: import.asserts.clone(),
		phase: Default::default(),
		src: Box::new(ast::Str {
			span: DUMMY_SP,
			value: import.source.clone(),
			raw: None,
		}),
		specifiers: vec![specifier],
	}))
}

fn resolve_import_for_id(
	global_imports: &IndexMap<Id, Import>,
	explicit_imports: &IndexMap<Id, Import>,
	id: &Id,
) -> Option<Import> {
	if let Some(import) = global_imports.get(id) {
		return Some(import.clone());
	}
	if let Some(import) = explicit_imports.get(id) {
		return Some(import.clone());
	}

	let mut global_matches = global_imports
		.iter()
		.filter(|(candidate, _)| candidate.0 == id.0)
		.map(|(_, import)| import.clone());
	if let Some(first) = global_matches.next() {
		if global_matches.next().is_none() {
			return Some(first);
		}
	}

	let mut explicit_matches = explicit_imports
		.iter()
		.filter(|(candidate, _)| candidate.0 == id.0)
		.map(|(_, import)| import.clone());
	if let Some(first) = explicit_matches.next() {
		if explicit_matches.next().is_none() {
			return Some(first);
		}
	}

	None
}

fn resolve_export_for_id(global: &GlobalCollect, id: &Id) -> Option<Option<Atom>> {
	global.resolve_export_name_for_id(id)
}

pub struct NewModuleCtx<'a> {
	pub expr: Box<ast::Expr>,
	pub path: &'a PathData,
	pub name: &'a str,
	pub local_idents: &'a [Id],
	pub scoped_idents: &'a [Id],
	pub global: &'a GlobalCollect,
	pub core_module: &'a Atom,
	pub need_transform: bool,
	pub explicit_extensions: bool,
	pub leading_comments: SingleThreadedCommentsMap,
	pub trailing_comments: SingleThreadedCommentsMap,
	pub extra_top_items: &'a BTreeMap<Id, ast::ModuleItem>,
	pub migrated_root_vars: &'a [ast::ModuleItem],
	pub explicit_imports: &'a IndexMap<Id, Import>,
}

pub fn new_module(ctx: NewModuleCtx) -> Result<(ast::Module, SingleThreadedComments), Error> {
	let comments = SingleThreadedComments::from_leading_and_trailing(
		ctx.leading_comments,
		ctx.trailing_comments,
	);
	let max_cap = ctx.global.imports.len() + ctx.global.exports.len() + ctx.extra_top_items.len();
	let mut module = ast::Module {
		span: DUMMY_SP,
		body: Vec::with_capacity(max_cap),
		shebang: None,
	};

	let has_scoped_idents = ctx.need_transform && !ctx.scoped_idents.is_empty();
	let _captures = if has_scoped_idents {
		let new_local = id!(private_ident!(&*_CAPTURES.clone()));
		module
			.body
			.push(create_synthetic_named_import(&new_local, ctx.core_module));
		Some(new_local)
	} else {
		None
	};

	let expr = if let Some(_captures) = _captures {
		Box::new(transform_function_expr(
			*ctx.expr,
			&_captures,
			ctx.scoped_idents,
		))
	} else {
		ctx.expr
	};

	// Hoist qrl() calls from the expression to module scope
	let (expr, hoisted_qrls) = hoist_qrls_from_expr(*expr);

	// Note: QRLs use `var` declarations which hoist, so forward references are OK
	// No filtering needed - duplicates are already handled by BTreeMap keys

	// Fix self-referential variable declarations within function bodies
	let expr = fix_self_referential_vars_in_function(expr);

	let expr = Box::new(expr);

	let extra_top_items = collect_needed_extra_top_items(
		ctx.extra_top_items,
		ctx.local_idents,
		ctx.scoped_idents,
		ctx.migrated_root_vars,
		&expr,
		&hoisted_qrls.values().cloned().collect::<Vec<_>>(),
	);

	let mut combined_local_idents: Vec<Id> = ctx.local_idents.to_vec();
	let mut local_idents_set: HashSet<Id> = ctx.local_idents.iter().cloned().collect();
	let mut hoisted_idents: HashSet<Id> = HashSet::new();
	for item in hoisted_qrls.values() {
		collect_module_item_idents(item, &mut hoisted_idents);
	}
	for item in &extra_top_items {
		collect_module_item_idents(item, &mut hoisted_idents);
	}
	for item in ctx.migrated_root_vars {
		collect_module_item_idents(item, &mut hoisted_idents);
	}
	let mut hoisted_idents_vec: Vec<Id> = hoisted_idents
		.into_iter()
		.filter(|id| !local_idents_set.contains(id))
		.collect();
	hoisted_idents_vec.sort_by(|a, b| a.0.cmp(&b.0));
	for id in hoisted_idents_vec {
		local_idents_set.insert(id.clone());
		combined_local_idents.push(id);
	}

	// Generate imports with collision detection and renaming
	// First pass: collect all imports and explicit import requirements
	let mut seen_import_names: HashMap<Atom, Vec<(Id, Import)>> = HashMap::new();

	for id in &combined_local_idents {
		// Check in priority order: exact match first, then unique symbol fallback
		let import_opt = resolve_import_for_id(&ctx.global.imports, ctx.explicit_imports, id);

		if let Some(import) = import_opt {
			seen_import_names
				.entry(id.0.clone())
				.or_default()
				.push((id.clone(), import));
		} else if ctx.global.has_export_symbol(&id.0) {
			// Only import from parent if it's actually exported there
			if let Some(export) = resolve_export_for_id(ctx.global, id) {
				// Handle exports from parent module
				let filename = if ctx.explicit_extensions {
					&ctx.path.file_name
				} else {
					&ctx.path.file_stem
				};
				let imported = export.as_ref().map(|e| {
					ast::ModuleExportName::Ident(ast::Ident::new(
						e.clone(),
						DUMMY_SP,
						Default::default(),
					))
				});
				module
					.body
					.push(ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(
						ast::ImportDecl {
							span: DUMMY_SP,
							type_only: false,
							with: None,
							phase: Default::default(),
							src: Box::new(ast::Str {
								span: DUMMY_SP,
								value: format!("./{}", filename).into(),
								raw: None,
							}),
							specifiers: vec![ast::ImportSpecifier::Named(
								ast::ImportNamedSpecifier {
									is_type_only: false,
									span: DUMMY_SP,
									imported,
									local: new_ident_from_id(id),
								},
							)],
						},
					)));
			}
		}
	}

	// Second pass: detect collisions and generate imports with stable ordering
	// A collision occurs when the same local name is needed for imports from different sources
	let mut sorted_import_names: Vec<_> = seen_import_names.into_iter().collect();
	sorted_import_names.sort_by(|a, b| a.0.cmp(&b.0));

	for (local_name, imports) in sorted_import_names {
		if imports.len() == 1 {
			// No collision, generate import directly
			let (id, import) = &imports[0];
			module.body.push(build_import_decl(import, id));
		} else {
			// Collision: multiple sources for same local name - rename them
			for (index, (id, import)) in imports.iter().enumerate() {
				// Rename to make unique: original_name, original_name_1, original_name_2, ...
				let renamed_local = if index == 0 {
					local_name.clone()
				} else {
					Atom::from(format!("{}_{}", local_name, index))
				};
				let renamed_id = (renamed_local, id.1);
				module.body.push(build_import_decl(import, &renamed_id));
			}
		}
	}

	let extra_top_items = collect_needed_extra_top_items(
		ctx.extra_top_items,
		ctx.local_idents,
		ctx.scoped_idents,
		ctx.migrated_root_vars,
		&expr,
		&hoisted_qrls.values().cloned().collect::<Vec<_>>(),
	);

	// CRITICAL: Collect symbols from imports already added to module.body FIRST
	// This ensures we filter out any items from extra_top_items that would conflict
	let mut already_imported_syms: HashSet<Atom> = HashSet::new();
	for item in &module.body {
		if let ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(import_decl)) = item {
			for specifier in &import_decl.specifiers {
				match specifier {
					ast::ImportSpecifier::Named(named) => {
						already_imported_syms.insert(named.local.sym.clone());
					}
					ast::ImportSpecifier::Default(default) => {
						already_imported_syms.insert(default.local.sym.clone());
					}
					ast::ImportSpecifier::Namespace(ns) => {
						already_imported_syms.insert(ns.local.sym.clone());
					}
				}
			}
		}
	}

	// Collect symbols already defined in hoisted_qrls and migrated_root_vars
	let mut already_defined_syms: HashSet<Atom> = already_imported_syms.clone();
	for item in hoisted_qrls.values() {
		let mut item_defs = HashSet::new();
		collect_defined_idents(item, &mut item_defs);
		already_defined_syms.extend(item_defs.into_iter().map(|id| id.0));
	}
	for item in ctx.migrated_root_vars {
		let mut item_defs = HashSet::new();
		collect_defined_idents(item, &mut item_defs);
		already_defined_syms.extend(item_defs.into_iter().map(|id| id.0));
	}
	// Also collect imported symbols from ctx.global.imports
	// These are symbols that are imported globally and should not be redeclared in segment modules
	for id in ctx.global.imports.keys() {
		already_defined_syms.insert(id.0.clone());
	}

	// Deduplicate extra_top_items by symbol name before partitioning
	// Use only symbol names (Atom) since SyntaxContext can vary
	// Also filter out items that duplicate definitions already in:
	// - hoisted_qrls
	// - migrated_root_vars
	// - ctx.global.imports (globally imported symbols that shouldn't be redeclared)
	let mut extra_top_seen_syms: HashSet<Atom> = already_defined_syms.clone();
	let mut deduplicated_extra: Vec<ast::ModuleItem> = Vec::new();
	for item in extra_top_items {
		let mut item_defs = HashSet::new();
		collect_defined_idents(&item, &mut item_defs);

		let is_dup = item_defs
			.iter()
			.any(|id| extra_top_seen_syms.contains(&id.0));
		if !is_dup {
			extra_top_seen_syms.extend(item_defs.into_iter().map(|id| id.0));
			deduplicated_extra.push(item);
		}
	}

	// Separate imports from non-imports to ensure all imports stay at the top
	let (extra_imports, extra_non_imports): (Vec<_>, Vec<_>) =
		deduplicated_extra.into_iter().partition(|item| {
			matches!(
				item,
				ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(_))
			)
		});

	// Add imports from extra_top_items
	module.body.extend(extra_imports);

	// Combine hoisted QRLs, migrated root variables, AND extra non-imports for joint sorting
	// This ensures correct dependency ordering between all declarations
	let mut combined_items: Vec<ast::ModuleItem> = hoisted_qrls.into_values().collect();
	combined_items.extend(ctx.migrated_root_vars.iter().cloned());
	combined_items.extend(extra_non_imports);

	// Apply topological sort to all items together to handle cross-dependencies
	let reorganized_combined = order_items_by_dependency(combined_items);

	// DISABLED: Bypass both reorganization and collection to isolate the issue
	// let inlined_qrl_refs = collect_inlined_qrl_references(&reorganized_combined);
	// let reorganized_combined =
	// 	reorganize_items_for_inlined_qrl(&reorganized_combined, &inlined_qrl_refs);

	// Collect defined identifiers from sorted combined items (by full Id)
	let mut defined_ids: HashSet<Id> = HashSet::new();
	for item in &reorganized_combined {
		collect_defined_idents(item, &mut defined_ids);
	}

	// Add all sorted combined items (hoisted QRLs + migrated root variables + extra non-imports)
	module.body.extend(reorganized_combined);

	// Apply final forward reference constraint:
	// Ensure NO item references an identifier defined later in the module
	// DISABLED: Testing if this is the source of the issue
	// module.body = ensure_inlined_qrl_after_refs(module.body);

	// Final AGGRESSIVE deduplication: remove ANY duplicate symbols from module body
	// This catches duplicates across imports, const declarations, and any other declarations
	// Use ONLY symbol name (Atom) for comparison to handle SyntaxContext variations
	let mut final_seen_syms: HashSet<Atom> = HashSet::new();
	let mut final_body = Vec::new();
	for item in module.body {
		let mut item_syms = HashSet::new();

		// Extract all symbols defined or imported by this item
		match &item {
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(import_decl)) => {
				// Extract imported symbol names
				for spec in &import_decl.specifiers {
					match spec {
						ast::ImportSpecifier::Named(n) => {
							item_syms.insert(n.local.sym.clone());
						}
						ast::ImportSpecifier::Default(d) => {
							item_syms.insert(d.local.sym.clone());
						}
						ast::ImportSpecifier::Namespace(ns) => {
							item_syms.insert(ns.local.sym.clone());
						}
					}
				}
			}
			ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(var))) => {
				// Extract declared variable names
				for decl in &var.decls {
					if let ast::Pat::Ident(ident) = &decl.name {
						item_syms.insert(ident.id.sym.clone());
					}
				}
			}
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(export)) => {
				// Extract exported declaration names
				match &export.decl {
					ast::Decl::Var(var) => {
						for decl in &var.decls {
							if let ast::Pat::Ident(ident) = &decl.name {
								item_syms.insert(ident.id.sym.clone());
							}
						}
					}
					ast::Decl::Fn(func) => {
						item_syms.insert(func.ident.sym.clone());
					}
					_ => {}
				}
			}
			_ => {}
		}

		// Check if any symbol from this item was already seen
		let is_duplicate = item_syms.iter().any(|sym| final_seen_syms.contains(sym));
		if !is_duplicate {
			final_seen_syms.extend(item_syms);
			final_body.push(item);
		}
	}
	module.body = final_body;

	module.body.push(create_named_export(expr, ctx.name));
	Ok((module, comments))
}

fn collect_needed_extra_top_items(
	extra_top_items: &BTreeMap<Id, ast::ModuleItem>,
	local_idents: &[Id],
	scoped_idents: &[Id],
	migrated_root_vars: &[ast::ModuleItem],
	expr: &ast::Expr,
	hoisted_items: &[ast::ModuleItem],
) -> Vec<ast::ModuleItem> {
	if extra_top_items.is_empty() {
		return Vec::new();
	}

	let mut needed: HashSet<Id> = local_idents.iter().cloned().collect();
	let mut needed_syms: HashSet<Atom> = needed.iter().map(|id| id.0.clone()).collect();
	needed.extend(scoped_idents.iter().cloned());
	needed_syms.extend(scoped_idents.iter().map(|id| id.0.clone()));
	for item in migrated_root_vars {
		collect_module_item_idents(item, &mut needed);
	}
	needed_syms.extend(needed.iter().map(|id| id.0.clone()));
	// Also collect identifiers from the main expression
	collect_expr_idents(expr, &mut needed);
	needed_syms.extend(needed.iter().map(|id| id.0.clone()));
	// And from hoisted QRL declarations (for qrlDEV/qrl imports)
	for item in hoisted_items {
		collect_module_item_idents(item, &mut needed);
	}
	needed_syms.extend(needed.iter().map(|id| id.0.clone()));

	let mut included: HashSet<Id> = HashSet::new();
	let mut changed = true;
	while changed {
		changed = false;
		for (id, item) in extra_top_items.iter() {
			let is_needed = needed.contains(id) || needed_syms.contains(&id.0);
			if is_needed && included.insert(id.clone()) {
				let before_ids = needed.len();
				let before_syms = needed_syms.len();
				collect_module_item_idents(item, &mut needed);
				needed_syms.extend(needed.iter().map(|local_id| local_id.0.clone()));
				changed = needed.len() != before_ids || needed_syms.len() != before_syms;
			}
		}
	}

	let mut result: Vec<_> = extra_top_items
		.iter()
		.filter(|&(id, _)| included.contains(id))
		.map(|(_, item)| item.clone())
		.collect();

	// Deduplicate by symbol name to handle cases where the same symbol
	// appears in extra_top_items with different SyntaxContexts
	let mut seen_syms: HashSet<Atom> = HashSet::new();
	let mut deduplicated_result: Vec<ast::ModuleItem> = Vec::new();
	for item in result {
		let mut item_defs = HashSet::new();
		collect_defined_idents(&item, &mut item_defs);

		// Check if any defined symbol was already seen
		let is_dup = item_defs.iter().any(|id| seen_syms.contains(&id.0));
		if !is_dup {
			seen_syms.extend(item_defs.into_iter().map(|id| id.0));
			deduplicated_result.push(item);
		}
	}
	result = deduplicated_result;

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

fn collect_expr_idents(expr: &ast::Expr, out: &mut HashSet<Id>) {
	let mut collector = AnyIdentCollector::new();
	expr.visit_with(&mut collector);
	out.extend(collector.local_idents);
}

fn collect_defined_idents(item: &ast::ModuleItem, out: &mut HashSet<Id>) {
	match item {
		ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(var))) => {
			for decl in &var.decls {
				collect_pat_idents(&decl.name, out);
			}
		}
		ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(import_decl)) => {
			// Extract symbols defined by imports (the local names)
			for specifier in &import_decl.specifiers {
				match specifier {
					ast::ImportSpecifier::Named(named) => {
						out.insert(id!(named.local));
					}
					ast::ImportSpecifier::Default(default) => {
						out.insert(id!(default.local));
					}
					ast::ImportSpecifier::Namespace(ns) => {
						out.insert(id!(ns.local));
					}
				}
			}
		}
		ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(decl)) => match &decl.decl {
			ast::Decl::Var(var) => {
				for decl in &var.decls {
					collect_pat_idents(&decl.name, out);
				}
			}
			ast::Decl::Fn(func) => {
				out.insert(id!(func.ident));
			}
			_ => {}
		},
		_ => {}
	}
}

fn collect_pat_idents(pat: &ast::Pat, out: &mut HashSet<Id>) {
	if let ast::Pat::Ident(ident) = pat {
		out.insert(id!(ident.id));
	}
}

fn has_qrl_pattern(expr: &ast::Expr) -> bool {
	match expr {
		ast::Expr::Call(call) => {
			// Check for $ suffixes (from source code)
			if let ast::Callee::Expr(box ast::Expr::Ident(ident)) = &call.callee {
				let name = ident.sym.as_ref();
				if name.ends_with('$') {
					return true;
				}
				// Also check for QRL infrastructure functions created during transformation
				if matches!(
					name,
					"componentQrl" | "qrl" | "inlinedQrl" | "inlinedQrlDev"
				) {
					return true;
				}
			}
			call.args.iter().any(|arg| has_qrl_pattern(&arg.expr))
		}
		ast::Expr::Paren(paren) => has_qrl_pattern(&paren.expr),
		_ => false,
	}
}

fn split_cyclic_var_decl(decl: &ast::VarDeclarator) -> Option<Vec<ast::ModuleItem>> {
	let ast::Pat::Ident(binding_ident) = &decl.name else {
		return None;
	};
	let init = decl.init.clone()?;

	let ident = binding_ident.id.clone();

	// Create let declaration without initialization
	let let_decl = ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(Box::new(ast::VarDecl {
		span: swc_common::DUMMY_SP,
		kind: ast::VarDeclKind::Let,
		decls: vec![ast::VarDeclarator {
			span: decl.span,
			name: ast::Pat::Ident(ast::BindingIdent {
				id: ident.clone(),
				type_ann: None,
			}),
			init: None,
			definite: false,
		}],
		declare: false,
		ctxt: swc_common::SyntaxContext::empty(),
	}))));

	// Create assignment statement
	let assign_stmt = ast::ModuleItem::Stmt(ast::Stmt::Expr(ast::ExprStmt {
		span: swc_common::DUMMY_SP,
		expr: Box::new(ast::Expr::Assign(ast::AssignExpr {
			span: swc_common::DUMMY_SP,
			op: ast::AssignOp::Assign,
			left: ast::AssignTarget::Simple(ast::SimpleAssignTarget::Ident(ast::BindingIdent {
				id: ident,
				type_ann: None,
			})),
			right: init,
		})),
	}));

	Some(vec![let_decl, assign_stmt])
}

fn order_items_by_dependency(items: Vec<ast::ModuleItem>) -> Vec<ast::ModuleItem> {
	if items.len() < 2 {
		return items;
	}

	// Map symbol names to defining item indices (ignore SyntaxContext for matching)
	let mut defined_by_name: HashMap<Atom, usize> = HashMap::new();
	let mut defines_by_item: Vec<HashSet<Atom>> = Vec::with_capacity(items.len());
	for (idx, item) in items.iter().enumerate() {
		let mut defines = HashSet::new();
		collect_declared_idents(item, &mut defines);
		let define_names: HashSet<Atom> = defines.iter().map(|id| id.0.clone()).collect();
		for name in &define_names {
			defined_by_name.entry(name.clone()).or_insert(idx);
		}
		defines_by_item.push(define_names);
	}

	// Build dependency graph based on symbol names only
	let mut deps_by_item: Vec<HashSet<usize>> = vec![HashSet::new(); items.len()];
	for (idx, item) in items.iter().enumerate() {
		let mut used = HashSet::new();
		collect_module_item_idents(item, &mut used);
		let used_names: HashSet<Atom> = used.iter().map(|id| id.0.clone()).collect();

		// Remove self-definitions
		let net_used_names: HashSet<Atom> = used_names
			.difference(&defines_by_item[idx])
			.cloned()
			.collect();

		for used_name in net_used_names {
			if let Some(def_idx) = defined_by_name.get(&used_name) {
				if *def_idx != idx {
					deps_by_item[idx].insert(*def_idx);
				}
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

		// First, collect cyclic items and apply two-phase emission if they contain QRL patterns
		let cyclic_items: Vec<_> = (0..items.len())
			.filter(|i| !seen[*i])
			.map(|i| items[i].clone())
			.collect();

		let mut result: Vec<_> = ordered.into_iter().map(|idx| items[idx].clone()).collect();

		for item in cyclic_items {
			// For cyclic items with QRL patterns, apply two-phase emission to break the cycle
			if let ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(var_decl))) = &item {
				if var_decl.decls.len() == 1 {
					if let Some(init) = &var_decl.decls[0].init {
						if has_qrl_pattern(init) {
							// Split into let + assign to break TDZ
							if let Some(split_items) = split_cyclic_var_decl(&var_decl.decls[0]) {
								result.extend(split_items);
								continue;
							}
						}
					}
				}
			}
			result.push(item);
		}

		return result;
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

// Filter out hoisted QRLs that reference identifiers already defined in the module
// This prevents forward reference errors for self-referential components
// Fix self-referential variable declarations in function bodies
// Transforms: const sig = useAsyncQrl(qrl(... [sig]))
// Into: const _ref = {}; _ref.sig = useAsyncQrl(qrl(... [_ref.sig])); const {sig} = _ref;
fn fix_self_referential_vars_in_function(expr: ast::Expr) -> ast::Expr {
	match expr {
		ast::Expr::Arrow(arrow) => ast::Expr::Arrow(fix_arrow_body_self_refs(arrow)),
		ast::Expr::Fn(fn_expr) => ast::Expr::Fn(fix_fn_body_self_refs(fn_expr)),
		other => other,
	}
}

fn fix_arrow_body_self_refs(mut arrow: ast::ArrowExpr) -> ast::ArrowExpr {
	if let box ast::BlockStmtOrExpr::BlockStmt(block) = &mut arrow.body {
		block.stmts = fix_stmts_self_refs(block.stmts.clone());
	}
	arrow
}

fn fix_fn_body_self_refs(mut fn_expr: ast::FnExpr) -> ast::FnExpr {
	if let Some(body) = &mut fn_expr.function.body {
		body.stmts = fix_stmts_self_refs(body.stmts.clone());
	}
	fn_expr
}

fn fix_stmts_self_refs(stmts: Vec<ast::Stmt>) -> Vec<ast::Stmt> {
	let mut result = Vec::new();
	let temp_id = pick_shared_self_ref_ident(&stmts);
	let mut emitted_shared_ref_decl = false;

	for stmt in stmts {
		if let ast::Stmt::Decl(ast::Decl::Var(ref var_decl)) = stmt {
			// Check if any declaration is self-referential
			let has_self_ref = var_decl.decls.iter().any(|decl| {
				if let ast::Pat::Ident(ident) = &decl.name {
					if let Some(init) = &decl.init {
						// Check if initializer references the variable being declared
						let mut used = HashSet::new();
						collect_expr_idents(init, &mut used);
						return used.iter().any(|used_id| used_id.0 == ident.id.sym);
					}
				}
				false
			});

			if has_self_ref && var_decl.decls.len() == 1 {
				// Transform using temporary object pattern
				let decl = &var_decl.decls[0];
				if let (ast::Pat::Ident(ident), Some(init)) = (&decl.name, &decl.init) {
					let var_name = &ident.id.sym;

					if !emitted_shared_ref_decl {
						// const _ref = {}
						result.push(ast::Stmt::Decl(ast::Decl::Var(Box::new(ast::VarDecl {
							span: var_decl.span,
							kind: ast::VarDeclKind::Const,
							declare: false,
							decls: vec![ast::VarDeclarator {
								span: DUMMY_SP,
								name: ast::Pat::Ident(ast::BindingIdent::from(temp_id.clone())),
								init: Some(Box::new(ast::Expr::Object(ast::ObjectLit {
									span: DUMMY_SP,
									props: vec![],
								}))),
								definite: false,
							}],
							ctxt: var_decl.ctxt,
						}))));
						emitted_shared_ref_decl = true;
					}

					// _ref.sig = ...
					result.push(ast::Stmt::Expr(ast::ExprStmt {
						span: DUMMY_SP,
						expr: Box::new(ast::Expr::Assign(ast::AssignExpr {
							span: DUMMY_SP,
							op: ast::AssignOp::Assign,
							left: ast::AssignTarget::Simple(ast::SimpleAssignTarget::Member(
								ast::MemberExpr {
									span: DUMMY_SP,
									obj: Box::new(ast::Expr::Ident(temp_id.clone())),
									prop: ast::MemberProp::Ident(ast::IdentName::new(
										var_name.clone(),
										DUMMY_SP,
									)),
								},
							)),
							right: Box::new(replace_self_refs_with_member_access(
								*init.clone(),
								var_name,
								&temp_id,
							)),
						})),
					}));

					// const {sig} = _ref
					result.push(ast::Stmt::Decl(ast::Decl::Var(Box::new(ast::VarDecl {
						span: var_decl.span,
						kind: var_decl.kind,
						declare: false,
						decls: vec![ast::VarDeclarator {
							span: DUMMY_SP,
							name: ast::Pat::Object(ast::ObjectPat {
								span: DUMMY_SP,
								props: vec![ast::ObjectPatProp::Assign(ast::AssignPatProp {
									span: DUMMY_SP,
									key: ident.id.clone().into(),
									value: None,
								})],
								optional: false,
								type_ann: None,
							}),
							init: Some(Box::new(ast::Expr::Ident(temp_id.clone()))),
							definite: false,
						}],
						ctxt: var_decl.ctxt,
					}))));

					continue;
				}
			}
		}

		result.push(stmt);
	}

	result
}

fn pick_shared_self_ref_ident(stmts: &[ast::Stmt]) -> ast::Ident {
	let mut declared_names: HashSet<Atom> = HashSet::new();

	for stmt in stmts {
		if let ast::Stmt::Decl(decl) = stmt {
			let mut declared = HashSet::new();
			collect_declared_idents_from_decl(decl, &mut declared);
			for id in declared {
				declared_names.insert(id.0);
			}
		}
	}

	let mut index = 0;
	loop {
		let candidate = if index == 0 {
			"_ref".to_string()
		} else {
			format!("_ref{}", index)
		};
		let candidate_atom: Atom = candidate.clone().into();
		if !declared_names.contains(&candidate_atom) {
			return ast::Ident::new(candidate_atom, DUMMY_SP, Default::default());
		}
		index += 1;
	}
}

// Replace references to var_name with _ref.var_name
fn replace_self_refs_with_member_access(
	expr: ast::Expr,
	var_name: &Atom,
	temp_id: &ast::Ident,
) -> ast::Expr {
	match expr {
		ast::Expr::Ident(ref ident) if &ident.sym == var_name => {
			ast::Expr::Member(ast::MemberExpr {
				span: DUMMY_SP,
				obj: Box::new(ast::Expr::Ident(temp_id.clone())),
				prop: ast::MemberProp::Ident(ast::IdentName::new(var_name.clone(), DUMMY_SP)),
			})
		}
		ast::Expr::Call(mut call) => {
			call.args = call
				.args
				.into_iter()
				.map(|arg| ast::ExprOrSpread {
					spread: arg.spread,
					expr: Box::new(replace_self_refs_with_member_access(
						*arg.expr, var_name, temp_id,
					)),
				})
				.collect();
			ast::Expr::Call(call)
		}
		ast::Expr::Array(mut arr) => {
			arr.elems = arr
				.elems
				.into_iter()
				.map(|elem| {
					elem.map(|e| ast::ExprOrSpread {
						spread: e.spread,
						expr: Box::new(replace_self_refs_with_member_access(
							*e.expr, var_name, temp_id,
						)),
					})
				})
				.collect();
			ast::Expr::Array(arr)
		}
		// Add more expression types as needed
		other => other,
	}
}

fn collect_declared_idents_from_decl(decl: &ast::Decl, out: &mut HashSet<Id>) {
	match decl {
		ast::Decl::Var(var) => {
			for decl in &var.decls {
				let mut identifiers: Vec<(Id, swc_common::Span)> = Vec::new();
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

fn create_named_export(expr: Box<ast::Expr>, name: &str) -> ast::ModuleItem {
	ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(ast::ExportDecl {
		span: DUMMY_SP,
		decl: ast::Decl::Var(Box::new(ast::VarDecl {
			span: DUMMY_SP,
			ctxt: Default::default(),
			kind: ast::VarDeclKind::Const,
			declare: false,
			decls: vec![ast::VarDeclarator {
				span: DUMMY_SP,
				definite: false,
				name: ast::Pat::Ident(ast::BindingIdent::from(ast::Ident::new(
					Atom::from(name),
					DUMMY_SP,
					Default::default(),
				))),
				init: Some(expr),
			}],
		})),
	}))
}

pub fn transform_function_expr(expr: ast::Expr, _captures: &Id, scoped_idents: &[Id]) -> ast::Expr {
	match expr {
		ast::Expr::Arrow(node) => {
			ast::Expr::Arrow(transform_arrow_fn(node, _captures, scoped_idents))
		}
		ast::Expr::Fn(node) => ast::Expr::Fn(transform_fn(node, _captures, scoped_idents)),
		_ => expr,
	}
}

fn transform_arrow_fn(
	arrow: ast::ArrowExpr,
	_captures: &Id,
	scoped_idents: &[Id],
) -> ast::ArrowExpr {
	match arrow.body {
		box ast::BlockStmtOrExpr::BlockStmt(mut block) => {
			let mut stmts = Vec::with_capacity(1 + block.stmts.len());
			stmts.push(read_captures(_captures, scoped_idents));
			stmts.append(&mut block.stmts);
			ast::ArrowExpr {
				body: Box::new(ast::BlockStmtOrExpr::BlockStmt(ast::BlockStmt {
					span: DUMMY_SP,
					ctxt: Default::default(),
					stmts,
				})),
				..arrow
			}
		}
		box ast::BlockStmtOrExpr::Expr(expr) => {
			let mut stmts = Vec::with_capacity(2);
			if !scoped_idents.is_empty() {
				stmts.push(read_captures(_captures, scoped_idents));
			}
			stmts.push(create_return_stmt(expr));
			ast::ArrowExpr {
				body: Box::new(ast::BlockStmtOrExpr::BlockStmt(ast::BlockStmt {
					span: DUMMY_SP,
					ctxt: Default::default(),
					stmts,
				})),
				..arrow
			}
		}
	}
}

fn transform_fn(node: ast::FnExpr, _captures: &Id, scoped_idents: &[Id]) -> ast::FnExpr {
	let mut stmts = Vec::with_capacity(
		1 + node
			.function
			.body
			.as_ref()
			.map_or(0, |body| body.stmts.len()),
	);
	if !scoped_idents.is_empty() {
		stmts.push(read_captures(_captures, scoped_idents));
	}
	if let Some(mut body) = node.function.body {
		stmts.append(&mut body.stmts);
	}
	ast::FnExpr {
		function: Box::new(ast::Function {
			body: Some(ast::BlockStmt {
				span: DUMMY_SP,
				ctxt: Default::default(),
				stmts,
			}),
			..*node.function
		}),
		..node
	}
}

pub const fn create_return_stmt(expr: Box<ast::Expr>) -> ast::Stmt {
	ast::Stmt::Return(ast::ReturnStmt {
		arg: Some(expr),
		span: DUMMY_SP,
	})
}

fn read_captures(_captures: &Id, scoped_idents: &[Id]) -> ast::Stmt {
	ast::Stmt::Decl(ast::Decl::Var(Box::new(ast::VarDecl {
		span: DUMMY_SP,
		ctxt: Default::default(),
		declare: false,
		kind: ast::VarDeclKind::Const,
		decls: scoped_idents
			.iter()
			.enumerate()
			.map(|(index, id)| ast::VarDeclarator {
				definite: false,
				span: DUMMY_SP,
				init: Some(Box::new(ast::Expr::Member(ast::MemberExpr {
					span: DUMMY_SP,
					obj: Box::new(ast::Expr::Ident(new_ident_from_id(_captures))),
					prop: ast::MemberProp::Computed(ast::ComputedPropName {
						span: DUMMY_SP,
						expr: Box::new(ast::Expr::Lit(ast::Lit::Num(ast::Number {
							span: DUMMY_SP,
							value: index as f64,
							raw: None,
						}))),
					}),
				}))),
				name: ast::Pat::Ident(ast::BindingIdent::from(new_ident_from_id(id))),
			})
			.collect(),
	})))
}

// Function to hoist qrl() calls from an expression to the module level
fn hoist_qrls_from_expr(expr: ast::Expr) -> (ast::Expr, BTreeMap<Id, ast::ModuleItem>) {
	let mut hoisted = BTreeMap::new();
	let mut visitor = QrlHoistingVisitor {
		hoisted: &mut hoisted,
	};
	let expr = expr.fold_with(&mut visitor);
	(expr, hoisted)
}

// Visitor to collect and hoist qrl() and inlinedQrl() calls
struct QrlHoistingVisitor<'a> {
	hoisted: &'a mut BTreeMap<Id, ast::ModuleItem>,
}

impl Fold for QrlHoistingVisitor<'_> {
	fn fold_expr(&mut self, expr: ast::Expr) -> ast::Expr {
		// First, recursively fold children
		let expr = expr.fold_children_with(self);

		// Check if this is a qrl() or inlinedQrl() call
		if let ast::Expr::Call(mut call_expr) = expr {
			if let ast::Callee::Expr(box ast::Expr::Ident(callee_ident)) = &call_expr.callee {
				let is_inlined_qrl = callee_ident.sym == *_INLINED_QRL
					|| callee_ident.sym == *_INLINED_QRL_DEV
					|| callee_ident.sym == *"inlinedQrlDev";
				if callee_ident.sym == *_QRL || is_inlined_qrl {
					// Extract the symbol name from the second argument
					if let Some(ast::ExprOrSpread {
						expr: second_arg, ..
					}) = call_expr.args.get(1)
					{
						if let ast::Expr::Lit(ast::Lit::Str(s)) = &**second_arg {
							let symbol_name = s.value.clone();

							if is_inlined_qrl {
								if let Some(first_arg) = call_expr.args.get_mut(0) {
									let first_arg_is_ident_or_null = matches!(
										&*first_arg.expr,
										ast::Expr::Ident(_) | ast::Expr::Lit(ast::Lit::Null(_))
									);

									if !first_arg_is_ident_or_null {
										let lifted_ident_id: Id = (
											Atom::from(format!("_inlined_{}", symbol_name)),
											swc_common::SyntaxContext::empty(),
										);

										if !self.hoisted.contains_key(&lifted_ident_id) {
											let lifted_declarator = ast::VarDeclarator {
												span: DUMMY_SP,
												name: ast::Pat::Ident(ast::BindingIdent::from(
													new_ident_from_id(&lifted_ident_id),
												)),
												init: Some(first_arg.expr.clone()),
												definite: false,
											};

											self.hoisted.insert(
												lifted_ident_id.clone(),
												ast::ModuleItem::Stmt(ast::Stmt::Decl(
													ast::Decl::Var(Box::new(ast::VarDecl {
														span: DUMMY_SP,
														kind: ast::VarDeclKind::Const,
														declare: false,
														ctxt: swc_common::SyntaxContext::empty(),
														decls: vec![lifted_declarator],
													})),
												)),
											);
										}

										first_arg.expr = Box::new(ast::Expr::Ident(
											new_ident_from_id(&lifted_ident_id),
										));
									}
								}
							}

							if is_inlined_qrl {
								if let Some(first_arg) = call_expr.args.first() {
									if matches!(&*first_arg.expr, ast::Expr::Ident(_)) {
										return ast::Expr::Call(call_expr);
									}
								}
							}

							// Check if there are captures (third argument)
							// Don't hoist QRLs with captures since they depend on local variables
							if let Some(ast::ExprOrSpread {
								expr: third_arg, ..
							}) = call_expr.args.get(2)
							{
								// If third arg is an array expression with elements, it has captures
								if let ast::Expr::Array(arr) = &**third_arg {
									if !arr.elems.is_empty() {
										// Skip hoisting this QRL - it has captures
										return ast::Expr::Call(call_expr);
									}
								}
							}

							let ident_name = Atom::from(format!("_qrl_{}", symbol_name));
							let id: Id = (ident_name, swc_common::SyntaxContext::empty());

							// Only hoist if we haven't already
							if !self.hoisted.contains_key(&id) {
								let declarator = ast::VarDeclarator {
									span: DUMMY_SP,
									name: ast::Pat::Ident(ast::BindingIdent::from(
										new_ident_from_id(&id),
									)),
									init: Some(Box::new(ast::Expr::Call(call_expr))),
									definite: false,
								};
								self.hoisted.insert(
									id.clone(),
									ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(
										Box::new(ast::VarDecl {
											span: DUMMY_SP,
											kind: ast::VarDeclKind::Const,
											declare: false,
											ctxt: swc_common::SyntaxContext::empty(),
											decls: vec![declarator],
										}),
									))),
								);
							}

							// Return just the identifier
							return ast::Expr::Ident(new_ident_from_id(&id));
						}
					}
				}
			}
			// Not a qrl() call, return the call expr as-is
			return ast::Expr::Call(call_expr);
		}

		expr
	}
}

#[cfg(test)]
mod import_dedup_tests {
	use super::*;
	use swc_atoms::atom;
	use swc_common::Globals;
	use swc_common::Mark;
	use swc_common::SyntaxContext;
	use swc_common::GLOBALS;

	#[test]
	fn test_build_import_decl_named_same_name() {
		// Import named specifier where imported name == local name
		let import = Import {
			source: atom!("@qwik.dev/core"),
			specifier: atom!("signal"),
			kind: ImportKind::Named,
			synthetic: false,
			asserts: None,
		};
		let id = (atom!("signal"), Default::default());

		let result = build_import_decl(&import, &id);

		// Verify it's a module item with import
		match result {
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(import_decl)) => {
				assert_eq!(import_decl.src.value, atom!("@qwik.dev/core"));
				assert_eq!(import_decl.specifiers.len(), 1);
			}
			_ => panic!("Expected import declaration"),
		}
	}

	#[test]
	fn test_build_import_decl_named_renamed() {
		// Import named specifier where imported name != local name (aliased)
		let import = Import {
			source: atom!("@qwik.dev/core"),
			specifier: atom!("signal"),
			kind: ImportKind::Named,
			synthetic: false,
			asserts: None,
		};
		let id = (atom!("sig"), Default::default());

		let result = build_import_decl(&import, &id);

		// Verify it's a module item with renamed import
		match result {
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(import_decl)) => {
				assert_eq!(import_decl.src.value, atom!("@qwik.dev/core"));
				assert_eq!(import_decl.specifiers.len(), 1);

				// Check specifier has the correct import name and local name
				if let ast::ImportSpecifier::Named(named) = &import_decl.specifiers[0] {
					// Should have imported name "signal" and local name "sig"
					assert!(named.imported.is_some());
					assert_eq!(named.local.sym, atom!("sig"));
				} else {
					panic!("Expected named specifier");
				}
			}
			_ => panic!("Expected import declaration"),
		}
	}

	#[test]
	fn test_build_import_decl_default() {
		// Default import
		let import = Import {
			source: atom!("./module"),
			specifier: atom!("default"),
			kind: ImportKind::Default,
			synthetic: false,
			asserts: None,
		};
		let id = (atom!("Module"), Default::default());

		let result = build_import_decl(&import, &id);

		// Verify it's a module item with default import
		match result {
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(import_decl)) => {
				assert_eq!(import_decl.src.value, atom!("./module"));
				assert_eq!(import_decl.specifiers.len(), 1);

				if let ast::ImportSpecifier::Default(_) = &import_decl.specifiers[0] {
					// Correct
				} else {
					panic!("Expected default specifier");
				}
			}
			_ => panic!("Expected import declaration"),
		}
	}

	#[test]
	fn test_collision_renaming_strategy() {
		// Test the collision renaming logic: first import keeps name, subsequent get indexed suffixes
		let base_name = atom!("foo");
		let renamed_first = base_name.clone();
		let renamed_second = Atom::from(format!("{}_{}", base_name, 1));
		let renamed_third = Atom::from(format!("{}_{}", base_name, 2));

		assert_eq!(renamed_first, atom!("foo"));
		assert_eq!(renamed_second, atom!("foo_1"));
		assert_eq!(renamed_third, atom!("foo_2"));
	}

	#[test]
	fn test_collect_needed_extra_top_items_with_context_mismatch() {
		GLOBALS.set(&Globals::new(), || {
			let defined_ctxt = SyntaxContext::empty();
			let used_ctxt = SyntaxContext::empty().apply_mark(Mark::new());

			let defined_id = (atom!("RouteStateContext"), defined_ctxt);
			let used_id = (atom!("RouteStateContext"), used_ctxt);

			let context_decl =
				ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(Box::new(ast::VarDecl {
					span: DUMMY_SP,
					ctxt: Default::default(),
					kind: ast::VarDeclKind::Const,
					declare: false,
					decls: vec![ast::VarDeclarator {
						span: DUMMY_SP,
						name: ast::Pat::Ident(ast::BindingIdent {
							id: ast::Ident::new(defined_id.0.clone(), DUMMY_SP, defined_ctxt),
							type_ann: None,
						}),
						init: Some(Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
							span: DUMMY_SP,
							value: atom!("qc-s"),
							raw: None,
						})))),
						definite: false,
					}],
				}))));

			let mut extra_top_items = BTreeMap::new();
			extra_top_items.insert(defined_id, context_decl);

			let result = collect_needed_extra_top_items(
				&extra_top_items,
				&[used_id],
				&[],
				&[],
				&ast::Expr::Lit(ast::Lit::Null(ast::Null { span: DUMMY_SP })),
				&[],
			);

			assert_eq!(result.len(), 1);
		});
	}
}
