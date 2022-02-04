use std::collections::{BTreeMap, HashSet};

use crate::code_move::fix_path;
use crate::collector::{
    collect_from_pat, new_ident_from_id, GlobalCollect, Id, IdentCollector, ImportKind,
};
use crate::entry_strategy::EntryPolicy;
use crate::parse::PathData;
use crate::words::*;

use anyhow::{bail, Error};
use lazy_static::lazy_static;
use regex::Regex;
use std::sync::{Arc, Mutex};
use swc_atoms::JsWord;
use swc_common::comments::{Comments, SingleThreadedComments};
use swc_common::{errors::HANDLER, Mark, Spanned, DUMMY_SP};
use swc_ecmascript::ast;
use swc_ecmascript::utils::{private_ident, ExprFactory};
use swc_ecmascript::visit::{fold_expr, noop_fold_type, Fold, FoldWith, VisitWith};

macro_rules! id {
    ($ident: expr) => {
        ($ident.sym.clone(), $ident.span.ctxt())
    };
}

macro_rules! id_eq {
    ($ident: expr, $cid: expr) => {
        if let Some(cid) = $cid {
            cid.0 == $ident.sym && cid.1 == $ident.span.ctxt()
        } else {
            false
        }
    };
}

#[derive(Debug, Clone)]
pub struct Hook {
    pub entry: Option<JsWord>,
    pub canonical_filename: String,
    pub name: JsWord,
    pub extension: JsWord,
    pub expr: Box<ast::Expr>,
    pub local_idents: Vec<Id>,
    pub scoped_idents: Vec<Id>,

    pub origin: String,
}

pub struct TransformContext {
    pub hooks_names: HashSet<String>,
}

impl TransformContext {
    pub fn new() -> ThreadSafeTransformContext {
        Arc::new(Mutex::new(Self {
            hooks_names: HashSet::with_capacity(10),
        }))
    }
}

pub type ThreadSafeTransformContext = Arc<Mutex<TransformContext>>;

#[derive(Debug)]
enum PositionToken {
    QComponent,
    ObjectProp,
    JSXListener,
    MarkerFunction,
    Arg(i8, i8),
    Any,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum IdentType {
    Var,
    Fn,
    Class,
}

pub type IdPlusType = (Id, IdentType);

#[allow(clippy::module_name_repetitions)]
pub struct QwikTransform<'a> {
    pub hooks: Vec<Hook>,
    pub qwik_ident: Id,
    pub options: QwikTransformOptions<'a>,

    extra_module_items: BTreeMap<Id, ast::ModuleItem>,
    stack_ctxt: Vec<String>,
    position_ctxt: Vec<PositionToken>,
    decl_stack: Vec<Vec<IdPlusType>>,
    in_component: bool,
    marker_functions: HashSet<Id>,
    qcomponent_fn: Option<Id>,
    qhook_fn: Option<Id>,
    h_fn: Option<Id>,
    fragment_fn: Option<Id>,

    hook_depth: i16,
    qhook_mark: swc_common::Mark,
}

pub struct QwikTransformOptions<'a> {
    pub context: ThreadSafeTransformContext,
    pub path_data: &'a PathData,
    pub entry_policy: &'a dyn EntryPolicy,
    pub extension: JsWord,
    pub explicity_extensions: bool,
    pub comments: Option<&'a SingleThreadedComments>,
    pub global_collect: GlobalCollect,
}

impl<'a> QwikTransform<'a> {
    pub fn new(options: QwikTransformOptions<'a>) -> Self {
        let imports = options
            .global_collect
            .imports
            .iter()
            .flat_map(|(id, import)| {
                if import.kind == ImportKind::Named && import.specifier.ends_with('$') {
                    Some(id.clone())
                } else {
                    None
                }
            });

        let exports = options.global_collect.exports.keys().flat_map(|id| {
            if id.0.ends_with('$') {
                Some(id.clone())
            } else {
                None
            }
        });

        let marker_functions = imports.chain(exports).collect();

        QwikTransform {
            stack_ctxt: Vec::with_capacity(16),
            position_ctxt: Vec::with_capacity(32),
            decl_stack: Vec::with_capacity(32),
            in_component: false,
            hooks: Vec::with_capacity(16),
            hook_depth: 0,
            extra_module_items: BTreeMap::new(),
            qcomponent_fn: options
                .global_collect
                .get_imported_local(&QCOMPONENT, &BUILDER_IO_QWIK),
            qhook_fn: options
                .global_collect
                .get_imported_local(&QHOOK, &BUILDER_IO_QWIK),
            h_fn: options
                .global_collect
                .get_imported_local(&H, &BUILDER_IO_QWIK),
            fragment_fn: options
                .global_collect
                .get_imported_local(&FRAGMENT, &BUILDER_IO_QWIK),
            marker_functions,
            qhook_mark: Mark::fresh(Mark::root()),
            qwik_ident: id!(private_ident!(QWIK_INTERNAL.clone())),
            options,
        }
    }

    fn register_context_name(&self, user_defined: &Option<String>) -> Result<String, Error> {
        let mut context = self.options.context.lock().unwrap();

        let symbol_name = if let Some(user_defined) = user_defined {
            if context.hooks_names.contains(user_defined) {
                bail!("Name collection for {}", user_defined);
            }
            user_defined.clone()
        } else {
            let mut symbol_name = self.stack_ctxt.join("_");
            if self.stack_ctxt.is_empty() {
                symbol_name += "_h";
            } else if self.stack_ctxt.len() == 1 && self.in_component {
                symbol_name += "_onmount";
            }
            symbol_name = escape_sym(&symbol_name);
            if context.hooks_names.contains(&symbol_name) {
                symbol_name += &context.hooks_names.len().to_string();
            }
            symbol_name
        };

        context.hooks_names.insert(symbol_name.clone());
        Ok(symbol_name)
    }

    fn create_synthetic_qhook(&mut self, expr: ast::Expr) -> ast::CallExpr {
        create_internal_call(&self.qwik_ident, &QHOOK, vec![expr], Some(self.qhook_mark))
    }

    fn handle_qhook(&mut self, node: ast::CallExpr) -> ast::CallExpr {
        let mut user_symbol = None;
        let mut node = node;
        node.args.reverse();

        if let Some(ast::ExprOrSpread {
            expr: first_arg, ..
        }) = node.args.pop()
        {
            let can_capture = can_capture_scope(&first_arg);
            let first_arg_span = first_arg.span();
            if let Some(second_arg) = node.args.pop() {
                if let ast::Expr::Lit(ast::Lit::Str(ref str)) = *second_arg.expr {
                    if validate_sym(&str.value) {
                        let custom_sym = str.value.to_string();
                        user_symbol = Some(custom_sym);
                    } else {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    str.span,
                                    "Second argument should be the name of a valid identifier",
                                )
                                .emit();
                        });
                    }
                } else {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(
                                second_arg.span(),
                                "Second argument should be a inlined string",
                            )
                            .emit();
                    });
                }
            }

            let symbol_name = match self.register_context_name(&user_symbol) {
                Ok(symbol_name) => symbol_name,
                Err(err) => {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err(node.span, &format!("{}", err))
                            .emit();
                    });
                    user_symbol.unwrap()
                }
            };

            let mut canonical_filename =
                ["h_", &self.options.path_data.file_prefix, "_", &symbol_name].concat();
            canonical_filename.make_ascii_lowercase();

            let symbol_name = JsWord::from(symbol_name);

            // Collect descendent idents
            let descendent_idents = {
                let mut collector = IdentCollector::new();
                first_arg.visit_with(&mut collector);
                collector.get_words()
            };

            let (valid_decl, invalid_decl): (_, Vec<_>) = self
                .decl_stack
                .iter()
                .flat_map(|v| v.iter())
                .cloned()
                .partition(|(_, t)| t == &IdentType::Var);

            let decl_collect: HashSet<Id> = valid_decl.into_iter().map(|a| a.0).collect();
            let invalid_decl: HashSet<Id> = invalid_decl.into_iter().map(|a| a.0).collect();

            self.hook_depth += 1;
            let folded = fold_expr(self, *first_arg);
            self.hook_depth -= 1;

            // Collect local idents
            let local_idents = {
                let mut collector = IdentCollector::new();
                folded.visit_with(&mut collector);

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
            };

            let entry = self.options.entry_policy.get_entry_for_sym(
                &symbol_name,
                self.options.path_data,
                &self.stack_ctxt,
            );

            let mut filename = format!(
                "./{}",
                entry
                    .as_ref()
                    .map(|e| e.as_ref())
                    .unwrap_or(&canonical_filename)
            );
            if self.options.explicity_extensions {
                filename.push('.');
                filename.push_str(&self.options.extension);
            }
            let import_path = fix_path("a", &self.options.path_data.path, &filename)
                // TODO: check with manu
                .unwrap();

            for id in &local_idents {
                if !self.options.global_collect.exports.contains_key(id) {
                    if let Some(span) = self.options.global_collect.root.get(id) {
                        HANDLER.with(|handler| {
                            handler
                                .struct_span_err(
                                    *span,
                                    &format!(
                                        "Reference to root level identifier needs to be exported: {}",
                                        id.0
                                    ),
                                )
                                .emit();
                        });
                    }
                    if invalid_decl.contains(id) {
                        HANDLER.with(|handler| {
                            handler
                                .struct_err(&format!(
                                    "Identifier can not capture because it's a function: {}",
                                    id.0
                                ))
                                .emit();
                        });
                    }
                }
            }

            let mut scoped_idents = compute_scoped_idents(&descendent_idents, &decl_collect);
            if !can_capture && !scoped_idents.is_empty() {
                HANDLER.with(|handler| {
                    handler
                        .struct_span_err(first_arg_span, "Identifier can not be captured")
                        .emit();
                });
                scoped_idents = vec![];
            }

            let o = create_inline_qrl(&self.qwik_ident, import_path, &symbol_name, &scoped_idents);
            self.hooks.push(Hook {
                entry,
                canonical_filename,
                name: symbol_name,
                extension: self.options.extension.clone(),
                expr: Box::new(folded),
                local_idents,
                scoped_idents,
                origin: self.options.path_data.path.to_string_lossy().into(),
            });
            o
        } else {
            node
        }
    }
}

impl<'a> Fold for QwikTransform<'a> {
    noop_fold_type!();

    fn fold_module(&mut self, node: ast::Module) -> ast::Module {
        let mut body = Vec::with_capacity(node.body.len() + 10);
        body.push(create_synthetic_wildcard_import(
            &self.qwik_ident,
            &BUILDER_IO_QWIK,
        ));

        let mut module_body = node.body.into_iter().map(|i| i.fold_with(self)).collect();
        body.extend(self.extra_module_items.values().cloned());
        body.append(&mut module_body);

        ast::Module { body, ..node }
    }

    // Variable tracking
    fn fold_var_declarator(&mut self, node: ast::VarDeclarator) -> ast::VarDeclarator {
        let mut stacked = false;
        if let ast::Pat::Ident(ref ident) = node.name {
            self.stack_ctxt.push(ident.id.sym.to_string());
            stacked = true;
        }
        if let Some(current_scope) = self.decl_stack.last_mut() {
            let mut identifiers = vec![];
            collect_from_pat(&node.name, &mut identifiers);
            current_scope.extend(identifiers.into_iter().map(|(id, _)| (id, IdentType::Var)));
        }
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
        self.decl_stack.push(vec![]);

        let mut identifiers = vec![];
        for param in &node.function.params {
            collect_from_pat(&param.pat, &mut identifiers);
        }
        self.decl_stack
            .last_mut()
            .expect("Declaration stack empty!")
            .extend(
                identifiers
                    .into_iter()
                    .map(|(key, _)| (key, IdentType::Var)),
            );

        let o = node.fold_children_with(self);
        self.stack_ctxt.pop();
        self.decl_stack.pop();

        o
    }

    fn fold_arrow_expr(&mut self, node: ast::ArrowExpr) -> ast::ArrowExpr {
        self.decl_stack.push(vec![]);
        let current_scope = self
            .decl_stack
            .last_mut()
            .expect("Declaration stack empty!");

        for param in &node.params {
            let mut identifiers = vec![];
            collect_from_pat(param, &mut identifiers);
            current_scope.extend(identifiers.into_iter().map(|(id, _)| (id, IdentType::Var)));
        }

        let o = node.fold_children_with(self);
        self.decl_stack.pop();

        o
    }

    fn fold_for_stmt(&mut self, node: ast::ForStmt) -> ast::ForStmt {
        self.decl_stack.push(vec![]);
        let o = node.fold_children_with(self);
        self.decl_stack.pop();

        o
    }

    fn fold_for_in_stmt(&mut self, node: ast::ForInStmt) -> ast::ForInStmt {
        self.decl_stack.push(vec![]);
        let o = node.fold_children_with(self);
        self.decl_stack.pop();

        o
    }

    fn fold_for_of_stmt(&mut self, node: ast::ForOfStmt) -> ast::ForOfStmt {
        self.decl_stack.push(vec![]);
        let o = node.fold_children_with(self);
        self.decl_stack.pop();

        o
    }

    fn fold_if_stmt(&mut self, node: ast::IfStmt) -> ast::IfStmt {
        self.decl_stack.push(vec![]);
        let o = node.fold_children_with(self);
        self.decl_stack.pop();

        o
    }

    fn fold_block_stmt(&mut self, node: ast::BlockStmt) -> ast::BlockStmt {
        self.decl_stack.push(vec![]);
        let o = node.fold_children_with(self);
        self.decl_stack.pop();

        o
    }

    fn fold_while_stmt(&mut self, node: ast::WhileStmt) -> ast::WhileStmt {
        self.decl_stack.push(vec![]);
        let o = node.fold_children_with(self);
        self.decl_stack.pop();

        o
    }

    fn fold_class_decl(&mut self, node: ast::ClassDecl) -> ast::ClassDecl {
        if let Some(current_scope) = self.decl_stack.last_mut() {
            current_scope.push((id!(node.ident), IdentType::Class));
        }

        self.stack_ctxt.push(node.ident.sym.to_string());
        self.decl_stack.push(vec![]);
        let o = node.fold_children_with(self);
        self.stack_ctxt.pop();
        self.decl_stack.pop();

        o
    }

    fn fold_jsx_opening_element(&mut self, node: ast::JSXOpeningElement) -> ast::JSXOpeningElement {
        let mut stacked = false;

        if let ast::JSXElementName::Ident(ref ident) = node.name {
            self.stack_ctxt.push(ident.sym.to_string());
            stacked = true;
        }
        let o = node.fold_children_with(self);
        if stacked {
            self.stack_ctxt.pop();
        }
        o
    }

    fn fold_key_value_prop(&mut self, node: ast::KeyValueProp) -> ast::KeyValueProp {
        let mut stacked = false;
        if let ast::PropName::Ident(ref ident) = node.key {
            self.stack_ctxt.push(ident.sym.to_string());
            self.position_ctxt.push(PositionToken::ObjectProp);
            stacked = true;
        }
        if let ast::PropName::Str(ref s) = node.key {
            self.stack_ctxt.push(s.value.to_string());
            self.position_ctxt.push(PositionToken::ObjectProp);
            stacked = true;
        }
        let o = node.fold_children_with(self);
        if stacked {
            self.position_ctxt.pop();
            self.stack_ctxt.pop();
        }
        o
    }

    fn fold_jsx_attr(&mut self, node: ast::JSXAttr) -> ast::JSXAttr {
        let mut is_listener = false;
        let node = match node.name {
            ast::JSXAttrName::Ident(ref ident) => {
                let ident_name = ident.sym.to_string();
                self.stack_ctxt.push(ident_name);
                node
            }
            ast::JSXAttrName::JSXNamespacedName(ref namespaced) => {
                let ns_name = namespaced.ns.sym.as_ref();
                let ident_name = [ns_name, namespaced.name.sym.as_ref()].concat();
                self.stack_ctxt.push(ident_name);

                is_listener = matches!(ns_name, "on$" | "onWindow$" | "onDocument$");
                let ns = if is_listener {
                    self.position_ctxt.push(PositionToken::JSXListener);
                    ast::Ident::new(ns_name[0..ns_name.len() - 1].into(), DUMMY_SP)
                } else {
                    namespaced.ns.clone()
                };
                ast::JSXAttr {
                    name: ast::JSXAttrName::JSXNamespacedName(ast::JSXNamespacedName {
                        ns,
                        name: namespaced.name.clone(),
                    }),
                    ..node
                }
            }
        };
        let o = node.fold_children_with(self);
        self.stack_ctxt.pop();
        if is_listener {
            self.position_ctxt.pop();
        }
        o
    }

    fn fold_expr(&mut self, node: ast::Expr) -> ast::Expr {
        let node = match (self.position_ctxt.as_slice(), node) {
            (
                [.., PositionToken::JSXListener]
                | [.., PositionToken::QComponent, PositionToken::Arg(_, 0)],
                ast::Expr::Arrow(arrow),
            ) => ast::Expr::Call(self.create_synthetic_qhook(ast::Expr::Arrow(arrow))),
            ([.., PositionToken::MarkerFunction, PositionToken::Arg(0, _)], expr) => {
                ast::Expr::Call(self.create_synthetic_qhook(expr))
            }
            (_, node) => node,
        };

        self.position_ctxt.push(PositionToken::Any);
        let o = node.fold_children_with(self);
        self.position_ctxt.pop();
        o
    }

    fn fold_call_expr(&mut self, node: ast::CallExpr) -> ast::CallExpr {
        let mut position_token = false;
        let mut name_token = false;
        let mut component_token = false;

        let mut replace_callee = None;
        if let ast::Callee::Expr(expr) = &node.callee {
            if node.span.has_mark(self.qhook_mark) {
                return self.handle_qhook(node);
            } else if let ast::Expr::Ident(ident) = &**expr {
                if id_eq!(ident, &self.qhook_fn) {
                    if let Some(comments) = self.options.comments {
                        comments.add_pure_comment(ident.span.lo);
                    }
                    return self.handle_qhook(node);
                } else if self.marker_functions.contains(&id!(ident)) {
                    if id_eq!(ident, &self.qcomponent_fn) {
                        self.position_ctxt.push(PositionToken::QComponent);
                        self.in_component = true;
                        component_token = true;
                        if let Some(comments) = self.options.comments {
                            comments.add_pure_comment(node.span.lo);
                        }
                    } else {
                        self.position_ctxt.push(PositionToken::MarkerFunction);
                        self.stack_ctxt.push(ident.sym.to_string());
                        name_token = true;
                    }
                    let global_collect = &mut self.options.global_collect;
                    if let Some(import) = global_collect.imports.get(&id!(ident)).cloned() {
                        let specifier = import.specifier.to_string();
                        let new_specifier: &str = &specifier[0..specifier.len() - 1];
                        let new_local =
                            global_collect.import(new_specifier.into(), import.source.clone());

                        let is_synthetic =
                            global_collect.imports.get(&new_local).unwrap().synthetic;

                        if is_synthetic && self.hook_depth == 0 {
                            self.extra_module_items.insert(
                                new_local.clone(),
                                create_synthetic_named_import(&new_local, &import.source),
                            );
                        }
                        replace_callee = Some(new_ident_from_id(&new_local).as_callee());
                    } else {
                        let specifier = ident.sym.to_string();
                        let new_specifier = JsWord::from(&specifier[0..specifier.len() - 1]);
                        let new_local = global_collect
                            .exports
                            .keys()
                            .find(|id| id.0 == new_specifier);

                        if let Some(new_local) = new_local {
                            replace_callee = Some(new_ident_from_id(new_local).as_callee());
                        } else {
                            HANDLER.with(|handler| {
                                handler
                                    .struct_span_err(
                                        ident.span,
                                        "Version without $ is not exported.",
                                    )
                                    .emit();
                            });
                        }
                    }
                    position_token = true;
                }
            }
        }

        let callee = if let Some(callee) = replace_callee {
            callee
        } else {
            node.callee
        };
        let callee = callee.fold_with(self);

        let total = node.args.len() as i8 - 1;
        let args: Vec<ast::ExprOrSpread> = node
            .args
            .into_iter()
            .enumerate()
            .map(|(i, arg)| {
                self.position_ctxt
                    .push(PositionToken::Arg(i as i8, total - i as i8));
                let o = arg.fold_with(self);
                self.position_ctxt.pop();
                o
            })
            .collect();

        if position_token {
            self.position_ctxt.pop();
        }
        if name_token {
            self.stack_ctxt.pop();
        }
        if component_token {
            self.in_component = false;
        }
        ast::CallExpr {
            callee,
            args,
            ..node
        }
    }
}

pub fn create_synthetic_wildcard_import(local: &Id, src: &JsWord) -> ast::ModuleItem {
    ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(ast::ImportDecl {
        span: DUMMY_SP,
        src: ast::Str {
            span: DUMMY_SP,
            has_escape: false,
            value: src.clone(),
            kind: ast::StrKind::Normal {
                contains_quote: false,
            },
        },
        asserts: None,
        type_only: false,
        specifiers: vec![ast::ImportSpecifier::Namespace(
            ast::ImportStarAsSpecifier {
                local: new_ident_from_id(local),
                span: DUMMY_SP,
            },
        )],
    }))
}

fn create_synthetic_named_import(local: &Id, src: &JsWord) -> ast::ModuleItem {
    ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(ast::ImportDecl {
        span: DUMMY_SP,
        src: ast::Str {
            span: DUMMY_SP,
            has_escape: false,
            value: src.clone(),
            kind: ast::StrKind::Normal {
                contains_quote: false,
            },
        },
        asserts: None,
        type_only: false,
        specifiers: vec![ast::ImportSpecifier::Named(ast::ImportNamedSpecifier {
            is_type_only: false,
            span: DUMMY_SP,
            local: new_ident_from_id(local),
            imported: None,
        })],
    }))
}

fn create_inline_qrl(qwik_ident: &Id, url: JsWord, symbol: &str, idents: &[Id]) -> ast::CallExpr {
    let mut args = vec![
        ast::Expr::Arrow(ast::ArrowExpr {
            is_async: false,
            is_generator: false,
            span: DUMMY_SP,
            params: vec![],
            return_type: None,
            type_params: None,
            body: ast::BlockStmtOrExpr::Expr(Box::new(ast::Expr::Call(ast::CallExpr {
                callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(ast::Ident::new(
                    "import".into(),
                    DUMMY_SP,
                )))),
                span: DUMMY_SP,
                type_args: None,
                args: vec![ast::ExprOrSpread {
                    spread: None,
                    expr: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
                        span: DUMMY_SP,
                        value: url,
                        has_escape: false,
                        kind: ast::StrKind::Synthesized,
                    }))),
                }],
            }))),
        }),
        ast::Expr::Lit(ast::Lit::Str(ast::Str {
            span: DUMMY_SP,
            value: symbol.into(),
            has_escape: false,
            kind: ast::StrKind::Synthesized,
        })),
    ];

    // Injects state
    if !idents.is_empty() {
        args.push(ast::Expr::Array(ast::ArrayLit {
            span: DUMMY_SP,
            elems: idents
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

    create_internal_call(qwik_ident, &QRL, args, None)
}

pub fn create_internal_call(
    qwik_ident: &Id,
    fn_name: &JsWord,
    exprs: Vec<ast::Expr>,
    mark: Option<Mark>,
) -> ast::CallExpr {
    let span = mark.map_or(DUMMY_SP, |mark| DUMMY_SP.apply_mark(mark));
    ast::CallExpr {
        callee: ast::Callee::Expr(Box::new(ast::Expr::Member(ast::MemberExpr {
            obj: Box::new(ast::Expr::Ident(new_ident_from_id(qwik_ident))),
            prop: ast::MemberProp::Ident(ast::Ident::new(fn_name.clone(), DUMMY_SP)),
            span: DUMMY_SP,
        }))),
        span,
        type_args: None,
        args: exprs
            .into_iter()
            .map(|expr| ast::ExprOrSpread {
                spread: None,
                expr: Box::new(expr),
            })
            .collect(),
    }
}

fn escape_sym(str: &str) -> String {
    str.chars()
        .flat_map(|x| match x {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '_' => Some(x),
            '$' => None,
            _ => Some('_'),
        })
        .collect()
}

fn validate_sym(sym: &str) -> bool {
    lazy_static! {
        static ref RE: Regex = Regex::new("^[_a-zA-Z][_a-zA-Z0-9]{0,30}$").unwrap();
    }
    RE.is_match(sym)
}

const fn can_capture_scope(expr: &ast::Expr) -> bool {
    matches!(expr, &ast::Expr::Fn(_) | &ast::Expr::Arrow(_))
}

fn compute_scoped_idents(all_idents: &[Id], all_decl: &HashSet<Id>) -> Vec<Id> {
    let mut set: HashSet<Id> = HashSet::new();
    for ident in all_idents {
        if all_decl.contains(ident) {
            set.insert(ident.clone());
        }
    }
    let mut output: Vec<Id> = set.into_iter().collect();
    output.sort();
    output
}
