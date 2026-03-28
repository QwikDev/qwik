use std::collections::{HashMap, HashSet, VecDeque};
use swc_common::DUMMY_SP;
use swc_ecmascript::ast;
use swc_ecmascript::visit::VisitWith;

use crate::collector::{GlobalCollect, Id, IdentCollector};

/// Root-level declaration associated with an identifier.
#[derive(Clone, Debug)]
pub enum RootVarDecl {
	Var(ast::VarDeclarator),
	Fn(ast::FnDecl),
	Class(ast::ClassDecl),
	TsEnum(Box<ast::TsEnumDecl>),
}

/// Information about a root-level variable's dependencies
#[derive(Clone, Debug)]
pub struct RootVarDependency {
	pub decl: RootVarDecl,
	pub is_imported: bool,   // true if this is from global.imports
	pub is_exported: bool,   // true if this is in global.exports
	pub depends_on: Vec<Id>, // Other identifiers this var depends on
}

/// Analyzes dependencies between root-level variables and imports.
/// Returns a map of root variable ID -> its dependencies
pub fn analyze_root_dependencies(
	module: &ast::Module,
	global_collect: &GlobalCollect,
) -> HashMap<Id, RootVarDependency> {
	let mut dependencies: HashMap<Id, RootVarDependency> = HashMap::new();

	// Track which variables are TRULY exported by the user (not auto-exports for segments)
	// We check for "export const" declarations or explicit "export { }" statements
	// that are NOT auto-exports (those have _auto_ prefix)
	let mut user_exported = std::collections::HashSet::new();
	for item in &module.body {
		match item {
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(export_decl)) => {
				match &export_decl.decl {
					ast::Decl::Var(var_decl) => {
						for decl in &var_decl.decls {
							let mut ids = Vec::new();
							collect_decl_idents(&decl.name, &mut ids);
							for id in ids {
								user_exported.insert(id.clone());
							}
						}
					}
					ast::Decl::Fn(function) => {
						user_exported.insert((function.ident.sym.clone(), function.ident.ctxt));
					}
					ast::Decl::Class(class) => {
						user_exported.insert((class.ident.sym.clone(), class.ident.ctxt));
					}
					ast::Decl::TsEnum(enu) => {
						user_exported.insert((enu.id.sym.clone(), enu.id.ctxt));
					}
					_ => {}
				}
			}
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportNamed(named)) => {
				for spec in &named.specifiers {
					if let ast::ExportSpecifier::Named(named_spec) = spec {
						if let ast::ModuleExportName::Ident(ident) = &named_spec.orig {
							if let Some(ast::ModuleExportName::Ident(exported_id)) =
								&named_spec.exported
							{
								// Skip auto-exports used for segment internals.
								let is_auto_export = exported_id.sym.starts_with("_auto_");
								if !is_auto_export {
									let id = (ident.sym.clone(), ident.ctxt);
									user_exported.insert(id.clone());
								}
							} else {
								// Plain `export { foo }` should be treated as user-exported.
								if !ident.sym.starts_with("_auto_") {
									let id = (ident.sym.clone(), ident.ctxt);
									user_exported.insert(id);
								}
							}
						}
					}
				}
			}
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDefaultExpr(default_export)) => {
				// Mark the default-exported identifier as exported
				if let ast::Expr::Ident(ident) = &*default_export.expr {
					user_exported.insert((ident.sym.clone(), ident.ctxt));
				}
			}
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDefaultDecl(default_decl)) => {
				// For "export default const X = ..." or function/class
				match &default_decl.decl {
					ast::DefaultDecl::Class(class) => {
						if let Some(ident) = &class.ident {
							user_exported.insert((ident.sym.clone(), ident.ctxt));
						}
					}
					ast::DefaultDecl::Fn(func) => {
						if let Some(ident) = &func.ident {
							user_exported.insert((ident.sym.clone(), ident.ctxt));
						}
					}
					_ => {}
				}
			}
			_ => {}
		}
	}

	// First pass: collect ALL root declarations from the module body
	for item in &module.body {
		if let ast::ModuleItem::Stmt(ast::Stmt::Decl(decl)) = item {
			match decl {
				ast::Decl::Var(var_decl) => {
					for decl in &var_decl.decls {
						let mut declared_ids = Vec::new();
						collect_decl_idents(&decl.name, &mut declared_ids);
						for var_id in declared_ids {
							if !dependencies.contains_key(&var_id) {
								dependencies.insert(
									var_id.clone(),
									RootVarDependency {
										decl: RootVarDecl::Var(ast::VarDeclarator {
											span: DUMMY_SP,
											name: ast::Pat::Ident(ast::BindingIdent {
												id: ast::Ident::new(
													var_id.0.clone(),
													DUMMY_SP,
													var_id.1,
												),
												type_ann: None,
											}),
											init: None,
											definite: false,
										}),
										is_imported: false,
										is_exported: user_exported.contains(&var_id),
										depends_on: Vec::new(),
									},
								);
							}
						}
					}
				}
				ast::Decl::Fn(function) => {
					let var_id = (function.ident.sym.clone(), function.ident.ctxt);
					dependencies
						.entry(var_id.clone())
						.or_insert_with(|| RootVarDependency {
							decl: RootVarDecl::Fn(function.clone()),
							is_imported: false,
							is_exported: user_exported.contains(&var_id),
							depends_on: Vec::new(),
						});
				}
				ast::Decl::Class(class) => {
					let var_id = (class.ident.sym.clone(), class.ident.ctxt);
					dependencies
						.entry(var_id.clone())
						.or_insert_with(|| RootVarDependency {
							decl: RootVarDecl::Class(class.clone()),
							is_imported: false,
							is_exported: user_exported.contains(&var_id),
							depends_on: Vec::new(),
						});
				}
				ast::Decl::TsEnum(enu) => {
					let var_id = (enu.id.sym.clone(), enu.id.ctxt);
					dependencies
						.entry(var_id.clone())
						.or_insert_with(|| RootVarDependency {
							decl: RootVarDecl::TsEnum(enu.clone()),
							is_imported: false,
							is_exported: user_exported.contains(&var_id),
							depends_on: Vec::new(),
						});
				}
				_ => {}
			}
		}
	}

	// Also add variables from global_collect.root (for imports)
	for var_id in global_collect.root.keys() {
		dependencies
			.entry(var_id.clone())
			.or_insert_with(|| RootVarDependency {
				decl: RootVarDecl::Var(ast::VarDeclarator {
					span: DUMMY_SP,
					name: ast::Pat::Ident(ast::BindingIdent {
						id: ast::Ident::new(var_id.0.clone(), DUMMY_SP, var_id.1),
						type_ann: None,
					}),
					init: None,
					definite: false,
				}),
				is_imported: false,
				is_exported: user_exported.contains(var_id),
				depends_on: Vec::new(),
			});
	}

	// Second pass: extract variable declarations and analyze dependencies
	for item in &module.body {
		if let ast::ModuleItem::Stmt(ast::Stmt::Decl(decl)) = item {
			match decl {
				ast::Decl::Var(var_decl) => {
					for decl in &var_decl.decls {
						// Get the identifier(s) being declared
						let mut declared_ids = Vec::new();
						collect_decl_idents(&decl.name, &mut declared_ids);

						// Analyze the initializer expression for dependencies
						if let Some(init_expr) = &decl.init {
							let mut collector = IdentCollector::new();
							init_expr.visit_with(&mut collector);
							let used_idents = collector.get_words();

							// For each declared identifier, record its dependencies
							for declared_id in declared_ids {
								if let Some(dep_info) = dependencies.get_mut(&declared_id) {
									dep_info.decl = RootVarDecl::Var(decl.clone());
									dep_info.depends_on = used_idents.clone();
								}
							}
						} else {
							// No initializer, update the decl but keep empty dependencies
							for declared_id in declared_ids {
								if let Some(dep_info) = dependencies.get_mut(&declared_id) {
									dep_info.decl = RootVarDecl::Var(decl.clone());
								}
							}
						}
					}
				}
				ast::Decl::Fn(function) => {
					let var_id = (function.ident.sym.clone(), function.ident.ctxt);
					let mut collector = IdentCollector::new();
					if let Some(body) = &function.function.body {
						body.visit_with(&mut collector);
					}
					let used_idents = collector.get_words();
					if let Some(dep_info) = dependencies.get_mut(&var_id) {
						dep_info.decl = RootVarDecl::Fn(function.clone());
						dep_info.depends_on = used_idents;
					}
				}
				ast::Decl::Class(class) => {
					let var_id = (class.ident.sym.clone(), class.ident.ctxt);
					let mut collector = IdentCollector::new();
					class.class.visit_with(&mut collector);
					let used_idents = collector.get_words();
					if let Some(dep_info) = dependencies.get_mut(&var_id) {
						dep_info.decl = RootVarDecl::Class(class.clone());
						dep_info.depends_on = used_idents;
					}
				}
				ast::Decl::TsEnum(enu) => {
					let var_id = (enu.id.sym.clone(), enu.id.ctxt);
					if let Some(dep_info) = dependencies.get_mut(&var_id) {
						dep_info.decl = RootVarDecl::TsEnum(enu.clone());
					}
				}
				_ => {}
			}
		}
	}

	dependencies
}

/// Collects all identifier names from a pattern
fn collect_decl_idents(pat: &ast::Pat, idents: &mut Vec<Id>) {
	match pat {
		ast::Pat::Ident(ident) => {
			idents.push((ident.id.sym.clone(), ident.id.ctxt));
		}
		ast::Pat::Array(array) => {
			for elem in array.elems.iter().flatten() {
				collect_decl_idents(elem, idents);
			}
		}
		ast::Pat::Rest(rest) => {
			collect_decl_idents(&rest.arg, idents);
		}
		ast::Pat::Object(obj) => {
			for prop in &obj.props {
				match prop {
					ast::ObjectPatProp::Assign(assign) => {
						idents.push((assign.key.sym.clone(), assign.key.ctxt));
					}
					ast::ObjectPatProp::KeyValue(kv) => {
						collect_decl_idents(&kv.value, idents);
					}
					ast::ObjectPatProp::Rest(rest) => {
						collect_decl_idents(&rest.arg, idents);
					}
				}
			}
		}
		ast::Pat::Assign(assign) => {
			collect_decl_idents(&assign.left, idents);
		}
		_ => {}
	}
}

/// Finds which segments use which root variables.
/// Returns a map: root_var_id -> Vec<segment_indices>
pub fn build_root_var_usage_map(
	segments: &[crate::transform::Segment],
	root_dependencies: &HashMap<Id, RootVarDependency>,
) -> indexmap::IndexMap<Id, Vec<usize>> {
	let mut usage_map: indexmap::IndexMap<Id, Vec<usize>> = indexmap::IndexMap::new();

	for (seg_idx, segment) in segments.iter().enumerate() {
		// Check both local_idents and scoped_idents for variables used by this segment
		let all_idents = [
			segment.data.local_idents.clone(),
			segment.data.scoped_idents.clone(),
		]
		.concat();
		for local_id in &all_idents {
			// Only track if this is a root variable (not imported from external modules)
			if root_dependencies.contains_key(local_id) {
				usage_map.entry(local_id.clone()).or_default().push(seg_idx);
			}
		}
	}

	usage_map
}

/// Finds root variables that are still referenced from the main module after
/// QRL extraction. This intentionally only considers module items that must
/// remain in the root module, such as top-level statements and exported
/// declarations/expressions.
pub fn build_main_module_usage_set(
	module: &ast::Module,
	root_dependencies: &HashMap<Id, RootVarDependency>,
) -> HashSet<Id> {
	let root_ids: HashSet<Id> = root_dependencies.keys().cloned().collect();
	let mut usage = HashSet::new();

	for item in &module.body {
		let should_check = match item {
			ast::ModuleItem::Stmt(ast::Stmt::Decl(_)) => false,
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(_)) => false,
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportNamed(_)) => false,
			ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportAll(_)) => false,
			_ => true,
		};

		if !should_check {
			continue;
		}

		let mut collector = IdentCollector::new();
		item.visit_with(&mut collector);
		let referenced = collector.get_words();

		let mut declared = Vec::new();
		collect_item_decl_idents(item, &mut declared);
		let declared: HashSet<Id> = declared.into_iter().collect();

		for id in referenced {
			if root_ids.contains(&id) && !declared.contains(&id) {
				usage.insert(id);
			}
		}
	}

	usage
}

/// Finds variables that are exclusive to a single segment and not exported.
/// For each exclusive variable, also collects its transitive dependencies.
/// Returns a map of segment_index -> Vec<variables to migrate>
pub fn find_migratable_vars(
	segments: &[crate::transform::Segment],
	root_dependencies: &HashMap<Id, RootVarDependency>,
	root_var_usage: &indexmap::IndexMap<Id, Vec<usize>>,
	main_module_usage: &HashSet<Id>,
) -> std::collections::BTreeMap<usize, Vec<Id>> {
	let mut migratable: std::collections::BTreeMap<usize, Vec<Id>> =
		std::collections::BTreeMap::new();

	for (root_var_id, segments_using) in root_var_usage.iter() {
		// Only migrate if:
		// 1. Used by exactly one segment
		// 2. Not exported
		// 3. Not already an import (must be a root variable declaration)
		// 4. Not still referenced by the main/root module
		if segments_using.len() == 1 && !main_module_usage.contains(root_var_id) {
			let seg_idx = segments_using[0];
			if let Some(dep_info) = root_dependencies.get(root_var_id) {
				if !dep_info.is_exported && !dep_info.is_imported {
					// Collect this variable and its transitive dependencies
					let transitive = collect_transitive_dependencies(
						root_var_id,
						root_dependencies,
						segments,
						seg_idx,
						main_module_usage,
					);

					migratable.entry(seg_idx).or_default().extend(transitive);
				}
			}
		}
	}

	// Safety filter: do not migrate a root var if it is still referenced by
	// another root declaration that is not migrated to the same segment.
	// This prevents removing module-scope declarations that are still required
	// by the root module (e.g. routeLoaderQrl using RouteStateContext).
	let mut changed = true;
	while changed {
		changed = false;

		let assignment: std::collections::BTreeMap<Id, usize> = migratable
			.iter()
			.flat_map(|(seg_idx, vars)| vars.iter().map(move |var_id| (var_id.clone(), *seg_idx)))
			.collect();

		for (seg_idx, vars) in migratable.iter_mut() {
			let before_len = vars.len();
			vars.retain(|candidate_id| {
				if main_module_usage.contains(candidate_id) {
					return false;
				}

				let candidate_target = assignment.get(candidate_id).copied().unwrap_or(*seg_idx);
				if !shared_declarator_migrates_as_a_unit(
					candidate_id,
					candidate_target,
					&assignment,
					root_dependencies,
				) {
					return false;
				}

				let used_by_incompatible_root =
					root_dependencies.iter().any(|(root_id, dep_info)| {
						// Ignore self-dependency and non-root/import nodes
						if root_id == candidate_id || dep_info.is_imported {
							return false;
						}

						// Only relevant if this root declaration references the candidate
						if !dep_info.depends_on.iter().any(|dep| dep == candidate_id) {
							return false;
						}

						// Safe only when the referencing root declaration is migrated
						// to the same segment as the candidate.
						assignment.get(root_id).copied() != Some(candidate_target)
					});

				!used_by_incompatible_root
			});

			if vars.len() != before_len {
				changed = true;
			}
		}

		migratable.retain(|_, vars| !vars.is_empty());
	}

	migratable
}

/// Recursively collects all transitive dependencies of a variable that should be migrated.
fn collect_transitive_dependencies(
	var_id: &Id,
	root_dependencies: &HashMap<Id, RootVarDependency>,
	_segments: &[crate::transform::Segment],
	_target_seg_idx: usize,
	main_module_usage: &HashSet<Id>,
) -> Vec<Id> {
	let mut result = vec![var_id.clone()];
	let mut queue = VecDeque::new();
	queue.push_back(var_id.clone());
	let mut visited = HashSet::new();
	visited.insert(var_id.clone());

	while let Some(current_id) = queue.pop_front() {
		if let Some(dep_info) = root_dependencies.get(&current_id) {
			for dep in &dep_info.depends_on {
				if !visited.contains(dep) {
					visited.insert(dep.clone());

					// Only include dependency if it's:
					// 1. A root variable (not imported)
					// 2. Not exported
					// 3. Not still referenced by the main/root module
					if let Some(dep_info) = root_dependencies.get(dep) {
						if !dep_info.is_exported
							&& !dep_info.is_imported
							&& !main_module_usage.contains(dep)
						{
							// Assume it's safe to migrate (doesn't have side effects)
							result.push(dep.clone());
							queue.push_back(dep.clone());
						}
					}
				}
			}
		}
	}

	result
}

fn shared_declarator_migrates_as_a_unit(
	candidate_id: &Id,
	candidate_target: usize,
	assignment: &std::collections::BTreeMap<Id, usize>,
	root_dependencies: &HashMap<Id, RootVarDependency>,
) -> bool {
	let Some(dep_info) = root_dependencies.get(candidate_id) else {
		return true;
	};

	let RootVarDecl::Var(decl) = &dep_info.decl else {
		return true;
	};

	let mut decl_ids = Vec::new();
	collect_decl_idents(&decl.name, &mut decl_ids);
	if decl_ids.len() <= 1 {
		return true;
	}

	decl_ids
		.iter()
		.all(|decl_id| assignment.get(decl_id) == Some(&candidate_target))
}

fn collect_item_decl_idents(item: &ast::ModuleItem, idents: &mut Vec<Id>) {
	match item {
		ast::ModuleItem::Stmt(ast::Stmt::Decl(decl)) => collect_decl_idents_from_decl(decl, idents),
		ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(export_decl)) => {
			collect_decl_idents_from_decl(&export_decl.decl, idents);
		}
		ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDefaultDecl(default_decl)) => {
			match &default_decl.decl {
				ast::DefaultDecl::Class(class) => {
					if let Some(ident) = &class.ident {
						idents.push((ident.sym.clone(), ident.ctxt));
					}
				}
				ast::DefaultDecl::Fn(func) => {
					if let Some(ident) = &func.ident {
						idents.push((ident.sym.clone(), ident.ctxt));
					}
				}
				_ => {}
			}
		}
		_ => {}
	}
}

fn collect_decl_idents_from_decl(decl: &ast::Decl, idents: &mut Vec<Id>) {
	match decl {
		ast::Decl::Var(var_decl) => {
			for decl in &var_decl.decls {
				collect_decl_idents(&decl.name, idents);
			}
		}
		ast::Decl::Fn(function) => {
			idents.push((function.ident.sym.clone(), function.ident.ctxt));
		}
		ast::Decl::Class(class) => {
			idents.push((class.ident.sym.clone(), class.ident.ctxt));
		}
		ast::Decl::TsEnum(enu) => {
			idents.push((enu.id.sym.clone(), enu.id.ctxt));
		}
		_ => {}
	}
}
