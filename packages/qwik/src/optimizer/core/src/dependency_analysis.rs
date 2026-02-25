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
							// Check if the exported name is _auto_ (auto-export for segments)
							if let Some(ast::ModuleExportName::Ident(exported_id)) =
								&named_spec.exported
							{
								let is_auto_export = exported_id.sym.starts_with("_auto_");
								if !is_auto_export {
									let id = (ident.sym.clone(), ident.ctxt);
									user_exported.insert(id.clone());
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
) -> HashMap<Id, Vec<usize>> {
	let mut usage_map: HashMap<Id, Vec<usize>> = HashMap::new();

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

/// Finds variables that are exclusive to a single segment and not exported.
/// For each exclusive variable, also collects its transitive dependencies.
/// Returns a map of segment_index -> Vec<variables to migrate>
pub fn find_migratable_vars(
	segments: &[crate::transform::Segment],
	root_dependencies: &HashMap<Id, RootVarDependency>,
	root_var_usage: &HashMap<Id, Vec<usize>>,
) -> HashMap<usize, Vec<Id>> {
	let mut migratable: HashMap<usize, Vec<Id>> = HashMap::new();

	for (root_var_id, segments_using) in root_var_usage.iter() {
		// Only migrate if:
		// 1. Used by exactly one segment
		// 2. Not exported
		// 3. Not already an import (must be a root variable declaration)
		if segments_using.len() == 1 {
			let seg_idx = segments_using[0];
			if let Some(dep_info) = root_dependencies.get(root_var_id) {
				if !dep_info.is_exported && !dep_info.is_imported {
					// Collect this variable and its transitive dependencies
					let transitive = collect_transitive_dependencies(
						root_var_id,
						root_dependencies,
						segments,
						seg_idx,
					);

					migratable.entry(seg_idx).or_default().extend(transitive);
				}
			}
		}
	}

	migratable
}

/// Recursively collects all transitive dependencies of a variable that should be migrated.
fn collect_transitive_dependencies(
	var_id: &Id,
	root_dependencies: &HashMap<Id, RootVarDependency>,
	_segments: &[crate::transform::Segment],
	_target_seg_idx: usize,
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
					// 3. Only used by this segment or shared with no harm
					if let Some(dep_info) = root_dependencies.get(dep) {
						if !dep_info.is_exported && !dep_info.is_imported {
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

/// Topologically sorts variables by their dependencies.
/// Returns variables in declaration order (dependencies first).
pub fn topological_sort_variables(
	var_ids: &[Id],
	root_dependencies: &HashMap<Id, RootVarDependency>,
) -> Vec<Id> {
	let mut in_degree: HashMap<Id, usize> = HashMap::new();
	let mut adj_list: HashMap<Id, Vec<Id>> = HashMap::new();

	// Initialize
	for var_id in var_ids {
		if !in_degree.contains_key(var_id) {
			in_degree.insert(var_id.clone(), 0);
		}
		if !adj_list.contains_key(var_id) {
			adj_list.insert(var_id.clone(), Vec::new());
		}
	}

	// Build graph: for each variable, add edges from its dependencies
	for var_id in var_ids {
		if let Some(dep_info) = root_dependencies.get(var_id) {
			for dep in &dep_info.depends_on {
				// Only consider dependencies within our set
				if var_ids.iter().any(|v| v == dep) {
					// dep -> var_id (var_id depends on dep)
					adj_list
						.entry(dep.clone())
						.or_default()
						.push(var_id.clone());
					*in_degree.entry(var_id.clone()).or_insert(0) += 1;
				}
			}
		}
	}

	// Kahn's algorithm
	let mut queue: VecDeque<Id> = in_degree
		.iter()
		.filter(|(_, &degree)| degree == 0)
		.map(|(id, _)| id.clone())
		.collect();

	let mut result = Vec::new();
	while let Some(current) = queue.pop_front() {
		result.push(current.clone());

		if let Some(neighbors) = adj_list.get(&current) {
			for neighbor in neighbors {
				let new_degree = in_degree[neighbor] - 1;
				in_degree.insert(neighbor.clone(), new_degree);
				if new_degree == 0 {
					queue.push_back(neighbor.clone());
				}
			}
		}
	}

	result
}
