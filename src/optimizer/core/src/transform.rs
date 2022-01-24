use std::collections::{HashMap, HashSet};

use crate::code_move::fix_path;
use crate::collector::{collect_from_pat, new_ident_from_id, GlobalCollect, Id, IdentCollector};
use crate::entry_strategy::EntryPolicy;
use crate::parse::PathData;
use crate::words::*;

use anyhow::{bail, Error};
use lazy_static::lazy_static;
use regex::Regex;
use std::sync::{Arc, Mutex};
use swc_atoms::JsWord;
use swc_common::comments::{Comments, SingleThreadedComments};
use swc_common::{errors::HANDLER, Mark, Span, DUMMY_SP};
use swc_ecmascript::ast;
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

    stack_ctxt: Vec<String>,
    position_ctxt: Vec<PositionToken>,
    decl_stack: Vec<Vec<IdPlusType>>,
    in_component: bool,
    marker_functions: HashSet<Id>,
    qcomponent_fn: Option<Id>,
    qhook_fn: Option<Id>,
    h_fn: Option<Id>,
    fragment_fn: Option<Id>,
    context: ThreadSafeTransformContext,

    path_data: &'a PathData,
    qhook_mark: swc_common::Mark,

    comments: Option<&'a SingleThreadedComments>,
    entry_policy: &'a dyn EntryPolicy,
    global_collect: &'a GlobalCollect,
}

impl<'a> QwikTransform<'a> {
    pub fn new(
        context: ThreadSafeTransformContext,
        path_data: &'a PathData,
        entry_policy: &'a dyn EntryPolicy,
        comments: Option<&'a SingleThreadedComments>,
        global_collect: &'a GlobalCollect,
    ) -> Self {
        QwikTransform {
            path_data,
            stack_ctxt: Vec::with_capacity(16),
            position_ctxt: Vec::with_capacity(32),
            decl_stack: Vec::with_capacity(32),
            in_component: false,
            hooks: Vec::with_capacity(16),
            global_collect,
            qcomponent_fn: global_collect.get_imported_local(&QCOMPONENT, &BUILDER_IO_QWIK),
            qhook_fn: global_collect.get_imported_local(&QHOOK, &BUILDER_IO_QWIK),
            h_fn: global_collect.get_imported_local(&H, &BUILDER_IO_QWIK),
            fragment_fn: global_collect.get_imported_local(&FRAGMENT, &BUILDER_IO_QWIK),
            marker_functions: MARKER_FUNTIONS
                .iter()
                .flat_map(|word| global_collect.get_imported_local(word, &BUILDER_IO_QWIK))
                .collect(),
            qhook_mark: Mark::fresh(Mark::root()),
            comments,
            entry_policy,
            context,
        }
    }

    fn register_context_name(&self, user_defined: &Option<String>) -> Result<String, Error> {
        let mut context = self.context.lock().unwrap();

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
        create_internal_call(&QHOOK, vec![expr], Some(self.qhook_mark))
    }

    fn handle_qhook(&mut self, node: ast::CallExpr) -> ast::CallExpr {
        let mut user_symbol = None;
        let mut node = node;
        node.args.reverse();

        if let Some(ast::ExprOrSpread {
            expr: first_arg, ..
        }) = node.args.pop()
        {
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
                ["h_", &self.path_data.file_prefix, "_", &symbol_name].concat();
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
            let folded = fold_expr(self, *first_arg);

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

            let entry =
                self.entry_policy
                    .get_entry_for_sym(&symbol_name, self.path_data, &self.stack_ctxt);

            let import_path = fix_path(
                "a",
                &self.path_data.path,
                &format!(
                    "./{}",
                    entry
                        .as_ref()
                        .map(|e| e.as_ref())
                        .unwrap_or(&canonical_filename)
                ),
            )
            // TODO: check with manu
            .unwrap();

            for id in &local_idents {
                if !self.global_collect.exports.contains_key(id) {
                    if let Some(span) = self.global_collect.root.get(id) {
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

            let scoped_idents = compute_scoped_idents(&descendent_idents, &decl_collect);

            let o = create_inline_qrl(import_path, &symbol_name, &scoped_idents);
            self.hooks.push(Hook {
                entry,
                canonical_filename,
                name: symbol_name,
                expr: Box::new(folded),
                local_idents,
                scoped_idents,
                origin: self.path_data.path.to_string_lossy().into(),
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
        let node = add_qwik_runtime_import(node);
        node.fold_children_with(self)
    }

    // Variable tracking
    fn fold_var_declarator(&mut self, node: ast::VarDeclarator) -> ast::VarDeclarator {
        let mut stacked = false;
        if let ast::Pat::Ident(ref ident) = node.name {
            self.stack_ctxt.push(ident.id.sym.to_string());
            stacked = true;
        }
        if let Some(current_scope) = self.decl_stack.last_mut() {
            let mut identifiers: HashMap<Id, _> = HashMap::new();
            collect_from_pat(&node.name, &mut identifiers);
            current_scope.extend(identifiers.into_keys().map(|id| (id, IdentType::Var)));
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

        let mut idents: HashMap<Id, Span> = HashMap::new();
        for param in &node.function.params {
            collect_from_pat(&param.pat, &mut idents);
        }
        self.decl_stack
            .last_mut()
            .expect("Declaration stack empty!")
            .extend(idents.into_keys().map(|key| (key, IdentType::Var)));

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
            let mut identifiers: HashMap<Id, _> = HashMap::new();
            collect_from_pat(param, &mut identifiers);
            current_scope.extend(identifiers.into_keys().map(|id| (id, IdentType::Var)));
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
        match node.name {
            ast::JSXAttrName::Ident(ref ident) => {
                let ident_name = ident.sym.to_string();
                self.stack_ctxt.push(ident_name);
            }
            ast::JSXAttrName::JSXNamespacedName(ref namespaced) => {
                let ns_name = namespaced.ns.sym.as_ref();
                let ident_name = [ns_name, namespaced.name.sym.as_ref()].concat();
                self.stack_ctxt.push(ident_name);

                is_listener = matches!(ns_name, "on" | "onWindow" | "onDocument");
                if is_listener {
                    self.position_ctxt.push(PositionToken::JSXListener);
                }
            }
        }
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

        if let ast::Callee::Expr(expr) = &node.callee {
            if node.span.has_mark(self.qhook_mark) {
                return self.handle_qhook(node);
            } else if let ast::Expr::Ident(ident) = &**expr {
                if id_eq!(ident, &self.qhook_fn) {
                    return self.handle_qhook(node);
                } else if id_eq!(ident, &self.qcomponent_fn) {
                    self.position_ctxt.push(PositionToken::QComponent);
                    self.in_component = true;
                    position_token = true;
                    component_token = true;
                    if let Some(comments) = self.comments {
                        comments.add_pure_comment(node.span.lo);
                    }
                } else if self.marker_functions.contains(&id!(ident)) {
                    self.position_ctxt.push(PositionToken::MarkerFunction);
                    self.stack_ctxt.push(ident.sym.to_string());
                    position_token = true;
                    name_token = true;
                }
            }
        }

        let callee = node.callee.fold_with(self);

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

fn add_qwik_runtime_import(mut module: ast::Module) -> ast::Module {
    let mut body = Vec::with_capacity(module.body.len() + 1);
    body.push(create_synthetic_wildcard_import(
        &QWIK_INTERNAL,
        &BUILDER_IO_QWIK,
    ));
    body.append(&mut module.body);
    ast::Module { body, ..module }
}

pub fn create_synthetic_wildcard_import(local: &JsWord, src: &JsWord) -> ast::ModuleItem {
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
                local: ast::Ident::new(local.clone(), DUMMY_SP),
                span: DUMMY_SP,
            },
        )],
    }))
}

// fn create_synthetic_named_import(
//     local: &JsWord,
//     imported: &JsWord,
//     src: &JsWord,
// ) -> ast::ModuleItem {
//     ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(ast::ImportDecl {
//         span: DUMMY_SP,
//         src: ast::Str {
//             span: DUMMY_SP,
//             has_escape: false,
//             value: src.clone(),
//             kind: ast::StrKind::Normal {
//                 contains_quote: false,
//             },
//         },
//         asserts: None,
//         type_only: false,
//         specifiers: vec![ast::ImportSpecifier::Named(ast::ImportNamedSpecifier {
//             is_type_only: false,
//             span: DUMMY_SP,
//             local: ast::Ident::new(local.clone(), DUMMY_SP),
//             imported: Some(ast::Ident::new(imported.clone(), DUMMY_SP)),
//         })],
//     }))
// }

fn create_inline_qrl(url: JsWord, symbol: &str, idents: &[Id]) -> ast::CallExpr {
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

    create_internal_call(&QRL, args, None)
}

pub fn create_internal_call(
    fn_name: &JsWord,
    exprs: Vec<ast::Expr>,
    mark: Option<Mark>,
) -> ast::CallExpr {
    let span = mark.map_or(DUMMY_SP, |mark| DUMMY_SP.apply_mark(mark));
    ast::CallExpr {
        callee: ast::Callee::Expr(Box::new(ast::Expr::Member(ast::MemberExpr {
            obj: Box::new(ast::Expr::Ident(ast::Ident::new(
                QWIK_INTERNAL.clone(),
                DUMMY_SP,
            ))),
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
        .map(|x| match x {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '_' => x,
            _ => '_',
        })
        .collect()
}

fn validate_sym(sym: &str) -> bool {
    lazy_static! {
        static ref RE: Regex = Regex::new("^[_a-zA-Z][_a-zA-Z0-9]{0,30}$").unwrap();
    }
    RE.is_match(sym)
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
