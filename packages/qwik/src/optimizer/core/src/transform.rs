use crate::code_move::{fix_path, transform_function_expr};
use crate::collector::{
    collect_from_pat, new_ident_from_id, GlobalCollect, Id, IdentCollector, ImportKind,
};
use crate::entry_strategy::EntryPolicy;
use crate::errors;
use crate::parse::PathData;
use crate::words::*;
use path_slash::PathExt;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::hash::Hash;
use std::hash::Hasher;

use swc_atoms::{js_word, JsWord};
use swc_common::comments::{Comments, SingleThreadedComments};
use swc_common::{errors::HANDLER, Span, Spanned, DUMMY_SP};
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HookKind {
    Function,
    Event,
}

#[derive(Debug, Clone)]
pub struct Hook {
    pub entry: Option<JsWord>,
    pub canonical_filename: JsWord,
    pub name: JsWord,
    pub expr: Box<ast::Expr>,
    pub data: HookData,
    pub hash: u64,
    pub span: Span,
}

#[derive(Debug, Clone)]
pub struct HookData {
    pub extension: JsWord,
    pub local_idents: Vec<Id>,
    pub scoped_idents: Vec<Id>,
    pub parent_hook: Option<JsWord>,
    pub ctx_kind: HookKind,
    pub ctx_name: JsWord,
    pub origin: JsWord,
    pub display_name: JsWord,
    pub hash: JsWord,
    pub need_transform: bool,
}

#[derive(Debug)]
enum PositionToken {
    JSXFunction,
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
    pub options: QwikTransformOptions<'a>,

    hooks_names: HashMap<String, u32>,
    extra_top_items: BTreeMap<Id, ast::ModuleItem>,
    extra_bottom_items: BTreeMap<Id, ast::ModuleItem>,
    stack_ctxt: Vec<String>,
    position_ctxt: Vec<PositionToken>,
    decl_stack: Vec<Vec<IdPlusType>>,
    in_component: bool,
    marker_functions: HashMap<Id, JsWord>,
    jsx_functions: HashSet<Id>,
    qcomponent_fn: Option<Id>,
    qhook_fn: Option<Id>,
    inlined_qrl_fn: Option<Id>,
    h_fn: Option<Id>,
    fragment_fn: Option<Id>,

    hook_stack: Vec<JsWord>,
}

pub struct QwikTransformOptions<'a> {
    pub path_data: &'a PathData,
    pub entry_policy: &'a dyn EntryPolicy,
    pub extension: JsWord,
    pub explicit_extensions: bool,
    pub comments: Option<&'a SingleThreadedComments>,
    pub global_collect: GlobalCollect,
    pub scope: Option<&'a String>,
    pub dev: bool,
    pub is_inline: bool,
}

fn convert_signal_word(id: &JsWord) -> Option<JsWord> {
    let ident_name = id.as_ref();
    let has_signal = ident_name.ends_with(SIGNAL);
    if has_signal {
        let new_specifier = [&ident_name[0..ident_name.len() - 1], LONG_SUFFIX].concat();
        Some(JsWord::from(new_specifier))
    } else {
        None
    }
}

impl<'a> QwikTransform<'a> {
    pub fn new(options: QwikTransformOptions<'a>) -> Self {
        let mut marker_functions = HashMap::new();
        for (id, import) in options.global_collect.imports.iter() {
            if import.kind == ImportKind::Named && import.specifier.ends_with(SIGNAL) {
                marker_functions.insert(id.clone(), import.specifier.clone());
            }
        }

        for id in options.global_collect.exports.keys() {
            if id.0.ends_with(SIGNAL) {
                marker_functions.insert(id.clone(), id.0.clone());
            }
        }

        let jsx_functions = options
            .global_collect
            .imports
            .iter()
            .flat_map(|(id, import)| {
                if import.kind == ImportKind::Named && import.source == *BUILDER_IO_QWIK_JSX {
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect();

        QwikTransform {
            stack_ctxt: Vec::with_capacity(16),
            position_ctxt: Vec::with_capacity(32),
            decl_stack: Vec::with_capacity(32),
            in_component: false,
            hooks: Vec::with_capacity(16),
            hook_stack: Vec::with_capacity(16),
            extra_top_items: BTreeMap::new(),
            extra_bottom_items: BTreeMap::new(),
            hooks_names: HashMap::new(),
            qcomponent_fn: options
                .global_collect
                .get_imported_local(&QCOMPONENT, &BUILDER_IO_QWIK),
            qhook_fn: options
                .global_collect
                .get_imported_local(&QHOOK, &BUILDER_IO_QWIK),
            inlined_qrl_fn: options
                .global_collect
                .get_imported_local(&INLINED_QRL, &BUILDER_IO_QWIK),
            h_fn: options
                .global_collect
                .get_imported_local(&H, &BUILDER_IO_QWIK),
            fragment_fn: options
                .global_collect
                .get_imported_local(&FRAGMENT, &BUILDER_IO_QWIK),
            marker_functions,
            jsx_functions,
            options,
        }
    }

    fn is_inside_module(&self) -> bool {
        self.hook_stack.is_empty() || self.options.is_inline
    }

    fn register_context_name(
        &mut self,
        custom_symbol: Option<JsWord>,
    ) -> (JsWord, JsWord, JsWord, u64) {
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
        let index = match self.hooks_names.get_mut(&display_name) {
            Some(count) => {
                *count += 1;
                *count
            }
            None => 0,
        };
        if index == 0 {
            self.hooks_names.insert(display_name.clone(), 0);
        } else {
            display_name += &format!("_{}", index);
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

        let symbol_name = if self.options.dev {
            format!("{}_{}", display_name, hash64)
        } else {
            format!("s_{}", hash64)
        };
        (
            JsWord::from(symbol_name),
            JsWord::from(display_name),
            JsWord::from(hash64),
            hash,
        )
    }

    fn handle_inlined_qhook(&mut self, mut node: ast::CallExpr) -> ast::CallExpr {
        node.args.reverse();

        let last_stack = self
            .stack_ctxt
            .last()
            .map_or_else(|| QHOOK.clone(), |last| JsWord::from(last.as_str()));

        let ctx_name = if last_stack.ends_with("Qrl") {
            JsWord::from(format!("{}$", last_stack.trim_end_matches("Qrl")))
        } else {
            last_stack
        };
        let ctx_kind = if ctx_name.starts_with("on") {
            HookKind::Event
        } else {
            HookKind::Function
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
            parse_symbol_name(symbol_name, self.options.dev)
        };

        self.hook_stack.push(symbol_name.clone());
        let folded = fold_expr(self, *first_arg.expr);
        self.hook_stack.pop();

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

        for id in &local_idents {
            if !self.options.global_collect.exports.contains_key(id)
                && self.options.global_collect.root.contains_key(id)
            {
                self.ensure_export(id);
            }
        }

        let hook_data = HookData {
            extension: self.options.extension.clone(),
            local_idents,
            scoped_idents,
            parent_hook: self.hook_stack.last().cloned(),
            ctx_kind,
            ctx_name,
            origin: self.options.path_data.rel_path.to_slash_lossy().into(),
            display_name,
            need_transform: false,
            hash,
        };
        self.create_hook(hook_data, folded, symbol_name, span, 0)
    }

    fn handle_qhook(&mut self, node: ast::CallExpr) -> ast::CallExpr {
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

            self.create_synthetic_qhook(
                *first_arg,
                HookKind::Function,
                QHOOK.clone(),
                custom_symbol,
            )
        } else {
            node
        }
    }

    fn create_synthetic_qhook(
        &mut self,
        first_arg: ast::Expr,
        ctx_kind: HookKind,
        ctx_name: JsWord,
        custom_symbol: Option<JsWord>,
    ) -> ast::CallExpr {
        let can_capture = can_capture_scope(&first_arg);
        let first_arg_span = first_arg.span();

        let (symbol_name, display_name, hash, hook_hash) =
            self.register_context_name(custom_symbol);

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

        self.hook_stack.push(symbol_name.clone());
        let span = first_arg.span();
        let folded = fold_expr(self, first_arg);
        self.hook_stack.pop();

        // Collect local idents
        let local_idents = self.get_local_idents(&folded);

        for id in &local_idents {
            if !self.options.global_collect.exports.contains_key(id) {
                if let Some(span) = self.options.global_collect.root.get(id) {
                    HANDLER.with(|handler| {
                        handler
                            .struct_span_err_with_code(
                                *span,
                                &format!(
                                    "Reference to identifier declared at the root '{}'. It needs to be exported in order to be used inside a Qrl($) scope.",
                                    id.0
                                ),
                                errors::get_diagnostic_id(errors::Error::RootLevelReference)
                            )
                            .emit();
                    });
                    // }
                }
                if invalid_decl.contains(id) {
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

        let mut scoped_idents = compute_scoped_idents(&descendent_idents, &decl_collect);
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

        if self.options.is_inline {
            let expr = if !scoped_idents.is_empty() {
                let new_local =
                    self.ensure_import(USE_LEXICAL_SCOPE.clone(), BUILDER_IO_QWIK.clone());
                transform_function_expr(folded, &new_local, &scoped_idents)
            } else {
                folded
            };
            self.create_inline_qrl(expr, &symbol_name, &scoped_idents)
        } else {
            let hook_data = HookData {
                extension: self.options.extension.clone(),
                local_idents,
                scoped_idents: scoped_idents.clone(),
                parent_hook: self.hook_stack.last().cloned(),
                ctx_kind,
                ctx_name,
                origin: self.options.path_data.rel_path.to_slash_lossy().into(),
                display_name,
                need_transform: true,
                hash,
            };
            self.create_hook(hook_data, folded, symbol_name, span, hook_hash)
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

    fn create_hook(
        &mut self,
        hook_data: HookData,
        expr: ast::Expr,
        symbol_name: JsWord,
        span: Span,
        hook_hash: u64,
    ) -> ast::CallExpr {
        let canonical_filename = get_canonical_filename(&symbol_name);

        let entry = self
            .options
            .entry_policy
            .get_entry_for_sym(
                &symbol_name,
                self.options.path_data,
                &self.stack_ctxt,
                &hook_data,
            )
            .map(|entry| JsWord::from(escape_sym(entry.as_ref())));

        let mut filename = format!(
            "./{}",
            entry
                .as_ref()
                .map(|e| e.as_ref())
                .unwrap_or(&canonical_filename)
        );
        if self.options.explicit_extensions {
            filename.push('.');
            filename.push_str(&self.options.extension);
        }
        let inside_hook = !self.hook_stack.is_empty();
        let import_path = if inside_hook {
            fix_path("a", "a", &filename)
        } else {
            fix_path(
                &self.options.path_data.base_dir,
                &self.options.path_data.abs_dir,
                &filename,
            )
        }
        .unwrap();

        let o = self.create_qrl(import_path, &symbol_name, &hook_data.scoped_idents);
        self.hooks.push(Hook {
            entry,
            span,
            canonical_filename,
            name: symbol_name,
            data: hook_data,
            expr: Box::new(expr),
            hash: hook_hash,
        });
        o
    }

    fn handle_jsx(&mut self, node: ast::CallExpr) -> ast::CallExpr {
        let mut name_token = false;
        let first_arg = node.args.get(0);
        if let Some(name) = first_arg {
            match &*name.expr {
                ast::Expr::Lit(ast::Lit::Str(str)) => {
                    self.stack_ctxt.push(str.value.to_string());
                    name_token = true;
                }
                ast::Expr::Ident(ident) => {
                    self.stack_ctxt.push(ident.sym.to_string());
                    name_token = true;
                }
                _ => {}
            }
        }
        self.position_ctxt.push(PositionToken::JSXFunction);
        let o = node.fold_children_with(self);
        self.position_ctxt.pop();
        if name_token {
            self.stack_ctxt.pop();
        }

        o
    }

    fn handle_jsx_value(
        &mut self,
        ctx_name: JsWord,
        value: Option<ast::JSXAttrValue>,
    ) -> Option<ast::JSXAttrValue> {
        if let Some(ast::JSXAttrValue::JSXExprContainer(container)) = value {
            if let ast::JSXExpr::Expr(expr) = container.expr {
                let is_fn = matches!(*expr, ast::Expr::Arrow(_) | ast::Expr::Fn(_));
                if is_fn {
                    Some(ast::JSXAttrValue::JSXExprContainer(ast::JSXExprContainer {
                        span: DUMMY_SP,
                        expr: ast::JSXExpr::Expr(Box::new(ast::Expr::Call(
                            self.create_synthetic_qhook(*expr, HookKind::Event, ctx_name, None),
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

    fn ensure_import(&mut self, new_specifier: JsWord, source: JsWord) -> Id {
        let new_local = self
            .options
            .global_collect
            .import(new_specifier, source.clone());

        let is_synthetic = self
            .options
            .global_collect
            .imports
            .get(&new_local)
            .unwrap()
            .synthetic;

        if is_synthetic && self.is_inside_module() {
            self.extra_top_items.insert(
                new_local.clone(),
                create_synthetic_named_import(&new_local, &source),
            );
        }
        new_local
    }

    fn ensure_export(&mut self, id: &Id) {
        if self.options.global_collect.add_export(id.clone(), None) {
            self.extra_bottom_items
                .insert(id.clone(), create_synthetic_named_export(id));
        }
    }

    fn create_qrl(&mut self, url: JsWord, symbol: &str, idents: &[Id]) -> ast::CallExpr {
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
                        js_word!("import"),
                        DUMMY_SP,
                    )))),
                    span: DUMMY_SP,
                    type_args: None,
                    args: vec![ast::ExprOrSpread {
                        spread: None,
                        expr: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
                            span: DUMMY_SP,
                            value: url,
                            raw: None,
                        }))),
                    }],
                }))),
            }),
            ast::Expr::Lit(ast::Lit::Str(ast::Str {
                span: DUMMY_SP,
                value: symbol.into(),
                raw: None,
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

        self.create_internal_call(&QRL, args)
    }

    fn create_inline_qrl(&mut self, expr: ast::Expr, symbol: &str, idents: &[Id]) -> ast::CallExpr {
        let mut args = vec![
            expr,
            ast::Expr::Lit(ast::Lit::Str(ast::Str {
                span: DUMMY_SP,
                value: symbol.into(),
                raw: None,
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

        self.create_internal_call(&INLINED_QRL, args)
    }

    pub fn create_internal_call(
        &mut self,
        fn_name: &JsWord,
        exprs: Vec<ast::Expr>,
    ) -> ast::CallExpr {
        let local = self.ensure_import(fn_name.clone(), BUILDER_IO_QWIK.clone());
        ast::CallExpr {
            callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(&local)))),
            span: DUMMY_SP,
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

    fn fix_dynamic_import(&self, node: ast::CallExpr) -> ast::CallExpr {
        if let Some(expr_spread) = node.args.get(0) {
            if let ast::Expr::Lit(ast::Lit::Str(string)) = &*expr_spread.expr {
                let new_value = fix_path(
                    &self.options.path_data.abs_dir,
                    &self.options.path_data.base_dir,
                    string.value.as_ref(),
                )
                .unwrap();

                return ast::CallExpr {
                    args: vec![ast::ExprOrSpread {
                        spread: None,
                        expr: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
                            value: new_value,
                            raw: None,
                            span: string.span,
                        }))),
                    }],
                    ..node
                };
            }
        }
        HANDLER.with(|handler| {
            handler
                .struct_span_err_with_code(
                    node.span,
                    "Dynamic import() inside Qrl($) scope is not a string, relative paths might break",
                    errors::get_diagnostic_id(errors::Error::DynamicImportInsideQhook),
                )
                .emit();
        });
        node
    }
}

impl<'a> Fold for QwikTransform<'a> {
    noop_fold_type!();

    fn fold_module(&mut self, node: ast::Module) -> ast::Module {
        let mut body = Vec::with_capacity(node.body.len() + 10);
        let mut module_body = node.body.into_iter().map(|i| i.fold_with(self)).collect();
        body.extend(self.extra_top_items.values().cloned());
        body.append(&mut module_body);
        body.extend(self.extra_bottom_items.values().cloned());

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

    fn fold_jsx_element(&mut self, node: ast::JSXElement) -> ast::JSXElement {
        let mut stacked = false;

        if let ast::JSXElementName::Ident(ref ident) = node.opening.name {
            self.stack_ctxt.push(ident.sym.to_string());
            stacked = true;
        }
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
        let mut is_listener = false;
        let node = match node.name {
            ast::JSXAttrName::Ident(ref ident) => {
                let new_word = convert_signal_word(&ident.sym);
                self.stack_ctxt.push(ident.sym.to_string());

                if new_word.is_some() {
                    is_listener = true;
                    ast::JSXAttr {
                        value: self.handle_jsx_value(ident.sym.clone(), node.value),
                        ..node
                    }
                } else {
                    node
                }
            }
            ast::JSXAttrName::JSXNamespacedName(ref namespaced) => {
                let new_word = convert_signal_word(&namespaced.name.sym);
                let ident_name = [
                    namespaced.ns.sym.as_ref(),
                    "-",
                    namespaced.name.sym.as_ref(),
                ]
                .concat();
                self.stack_ctxt.push(ident_name.clone());
                if new_word.is_some() {
                    is_listener = true;
                    ast::JSXAttr {
                        value: self.handle_jsx_value(JsWord::from(ident_name), node.value),
                        ..node
                    }
                } else {
                    node
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

    fn fold_key_value_prop(&mut self, node: ast::KeyValueProp) -> ast::KeyValueProp {
        let jsx_call = matches!(self.position_ctxt.last(), Some(PositionToken::JSXFunction));

        let mut name_token = false;

        let node = match node.key {
            ast::PropName::Ident(ref ident) => {
                if ident.sym != *CHILDREN {
                    self.stack_ctxt.push(ident.sym.to_string());
                    name_token = true;
                }
                if jsx_call {
                    if convert_signal_word(&ident.sym).is_some()
                        && matches!(*node.value, ast::Expr::Arrow(_) | ast::Expr::Fn(_))
                    {
                        ast::KeyValueProp {
                            value: Box::new(ast::Expr::Call(self.create_synthetic_qhook(
                                *node.value,
                                HookKind::Event,
                                ident.sym.clone(),
                                None,
                            ))),
                            ..node
                        }
                    } else {
                        node
                    }
                } else {
                    node
                }
            }
            ast::PropName::Str(ref s) => {
                if s.value != *CHILDREN {
                    self.stack_ctxt.push(s.value.to_string());
                    name_token = true;
                }
                if jsx_call {
                    if convert_signal_word(&s.value).is_some()
                        && matches!(*node.value, ast::Expr::Arrow(_) | ast::Expr::Fn(_))
                    {
                        ast::KeyValueProp {
                            value: Box::new(ast::Expr::Call(self.create_synthetic_qhook(
                                *node.value,
                                HookKind::Event,
                                s.value.clone(),
                                None,
                            ))),
                            ..node
                        }
                    } else {
                        node
                    }
                } else {
                    node
                }
            }
            _ => node,
        };

        self.position_ctxt.push(PositionToken::Any);
        let o = node.fold_children_with(self);
        self.position_ctxt.pop();
        if name_token {
            self.stack_ctxt.pop();
        }
        o
    }

    fn fold_call_expr(&mut self, node: ast::CallExpr) -> ast::CallExpr {
        let mut name_token = false;
        let mut component_token = false;
        let mut replace_callee = None;
        let mut ctx_name: JsWord = QHOOK.clone();

        match &node.callee {
            ast::Callee::Import(_) => {
                if !self.is_inside_module() {
                    return self.fix_dynamic_import(node);
                }
            }
            ast::Callee::Expr(expr) => {
                if let ast::Expr::Ident(ident) = &**expr {
                    if id_eq!(ident, &self.qhook_fn) {
                        if let Some(comments) = self.options.comments {
                            comments.add_pure_comment(ident.span.lo);
                        }
                        return self.handle_qhook(node);
                    } else if self.jsx_functions.contains(&id!(ident)) {
                        return self.handle_jsx(node);
                    } else if id_eq!(ident, &self.inlined_qrl_fn) {
                        return self.handle_inlined_qhook(node);
                    } else if let Some(specifier) = self.marker_functions.get(&id!(ident)) {
                        self.stack_ctxt.push(ident.sym.to_string());
                        ctx_name = specifier.clone();
                        name_token = true;

                        if id_eq!(ident, &self.qcomponent_fn) {
                            self.in_component = true;
                            component_token = true;
                            if let Some(comments) = self.options.comments {
                                comments.add_pure_comment(node.span.lo);
                            }
                        }
                        let global_collect = &mut self.options.global_collect;
                        if let Some(import) = global_collect.imports.get(&id!(ident)).cloned() {
                            let new_specifier = convert_signal_word(&import.specifier)
                                .expect("Specifier ends with $");
                            let new_local = self.ensure_import(new_specifier, import.source);
                            replace_callee = Some(new_ident_from_id(&new_local).as_callee());
                        } else {
                            let new_specifier =
                                convert_signal_word(&ident.sym).expect("Specifier ends with $");
                            let new_local = global_collect
                                .exports
                                .keys()
                                .find(|id| id.0 == new_specifier);

                            new_local.map_or_else(
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
            }
            _ => {}
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
                        expr: Box::new(ast::Expr::Call(self.create_synthetic_qhook(
                            *arg.expr,
                            HookKind::Function,
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

pub fn add_handle_watch(body: &mut Vec<ast::ModuleItem>, private: bool) {
    let ident = if private {
        private_ident!(JsWord::from("hW"))
    } else {
        ast::Ident::new(JsWord::from("hW"), DUMMY_SP)
    };
    let import = create_synthetic_named_import_auto(&id!(ident), &HANDLE_WATCH, &BUILDER_IO_QWIK);
    body.push(import);
    body.push(ast::ModuleItem::Stmt(ast::Stmt::Expr(ast::ExprStmt {
        span: DUMMY_SP,
        expr: Box::new(ast::Expr::Bin(ast::BinExpr {
            span: DUMMY_SP,
            op: ast::BinaryOp::LogicalAnd,
            left: Box::new(ast::Expr::Member(ast::MemberExpr {
                obj: Box::new(ast::Expr::Ident(ident.clone())),
                prop: ast::MemberProp::Ident(ast::Ident::new(JsWord::from("issue123"), DUMMY_SP)),
                span: DUMMY_SP,
            })),
            right: Box::new(ast::Expr::Call(ast::CallExpr {
                callee: ast::Callee::Expr(Box::new(ast::Expr::Member(ast::MemberExpr {
                    obj: Box::new(ast::Expr::Ident(ident.clone())),
                    prop: ast::MemberProp::Ident(ast::Ident::new(
                        JsWord::from("issue123"),
                        DUMMY_SP,
                    )),
                    span: DUMMY_SP,
                }))),
                args: vec![],
                span: DUMMY_SP,
                type_args: None,
            })),
        })),
    })));
    body.push(ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportNamed(
        ast::NamedExport {
            src: None,
            span: DUMMY_SP,
            asserts: None,
            type_only: false,
            specifiers: vec![ast::ExportSpecifier::Named(ast::ExportNamedSpecifier {
                orig: ast::ModuleExportName::Ident(ident),
                exported: Some(ast::ModuleExportName::Ident(ast::Ident::new(
                    HANDLE_WATCH.clone(),
                    DUMMY_SP,
                ))),
                is_type_only: false,
                span: DUMMY_SP,
            })],
        },
    )));
    // Uncommented when issue 456 is fixed
    // body.push(create_synthetic_named_export(
    //     &HANDLE_WATCH,
    //     &BUILDER_IO_QWIK,
    // ));
}

pub fn create_synthetic_named_import_auto(
    local: &Id,
    specifier: &JsWord,
    src: &JsWord,
) -> ast::ModuleItem {
    ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(ast::ImportDecl {
        span: DUMMY_SP,
        src: ast::Str {
            span: DUMMY_SP,
            value: src.clone(),
            raw: None,
        },
        asserts: None,
        type_only: false,
        specifiers: vec![ast::ImportSpecifier::Named(ast::ImportNamedSpecifier {
            local: new_ident_from_id(local),
            is_type_only: false,
            imported: Some(ast::ModuleExportName::Ident(ast::Ident::new(
                specifier.clone(),
                DUMMY_SP,
            ))),
            span: DUMMY_SP,
        })],
    }))
}

pub fn create_synthetic_named_export(local: &Id) -> ast::ModuleItem {
    ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportNamed(ast::NamedExport {
        span: DUMMY_SP,
        type_only: false,
        asserts: None,
        specifiers: vec![ast::ExportSpecifier::Named(ast::ExportNamedSpecifier {
            span: DUMMY_SP,
            is_type_only: false,
            orig: ast::ModuleExportName::Ident(new_ident_from_id(local)),
            exported: None,
        })],
        src: None,
    }))
}

pub fn create_synthetic_named_import(local: &Id, src: &JsWord) -> ast::ModuleItem {
    ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(ast::ImportDecl {
        span: DUMMY_SP,
        src: ast::Str {
            span: DUMMY_SP,
            value: src.clone(),
            raw: None,
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

fn escape_sym(str: &str) -> String {
    str.chars()
        .flat_map(|x| match x {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '_' => Some(x),
            '$' => None,
            _ => Some('_'),
        })
        .collect()
}

const fn can_capture_scope(expr: &ast::Expr) -> bool {
    matches!(expr, &ast::Expr::Fn(_) | &ast::Expr::Arrow(_))
}

fn base64(nu: u64) -> String {
    base64::encode_config(nu.to_le_bytes(), base64::URL_SAFE_NO_PAD)
        .replace('-', "0")
        .replace('_', "0")
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

fn get_canonical_filename(symbol_name: &JsWord) -> JsWord {
    JsWord::from(symbol_name.as_ref().to_ascii_lowercase())
}

fn parse_symbol_name(symbol_name: JsWord, dev: bool) -> (JsWord, JsWord, JsWord) {
    let mut splitter = symbol_name.rsplitn(2, '_');
    let hash = splitter
        .next()
        .expect("symbol_name always need to have a segment");
    let display_name = splitter.next().unwrap_or(hash);

    let s_n = if dev {
        symbol_name.clone()
    } else {
        JsWord::from(format!("s_{}", hash))
    };
    (s_n, display_name.into(), hash.into())
}
