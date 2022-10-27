use crate::code_move::{fix_path, transform_function_expr};
use crate::collector::{
    collect_from_pat, new_ident_from_id, GlobalCollect, Id, IdentCollector, ImportKind,
};
use crate::entry_strategy::EntryPolicy;
use crate::errors;
use crate::is_immutable::{is_immutable_children, is_immutable_expr};
use crate::parse::{EmitMode, PathData};
use crate::words::*;
use path_slash::PathExt;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt::Write as _;
use std::hash::Hash;
use std::hash::Hasher; // import without risk of name clashing
use std::path::Path;

use swc_atoms::{js_word, JsWord};
use swc_common::comments::{Comments, SingleThreadedComments};
use swc_common::{errors::HANDLER, Span, Spanned, DUMMY_SP};
use swc_ecmascript::ast;
use swc_ecmascript::utils::ExprFactory;
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum IdentType {
    Var(bool),
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
    pub mode: EmitMode,
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
                if import.kind == ImportKind::Named
                    && (import.source == *BUILDER_IO_QWIK_JSX
                        || import.source == *BUILDER_IO_QWIK_JSX_DEV)
                {
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect();

        QwikTransform {
            stack_ctxt: Vec::with_capacity(16),
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
                .get_imported_local(&_INLINED_QRL, &BUILDER_IO_QWIK),
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

        let symbol_name = if matches!(self.options.mode, EmitMode::Dev | EmitMode::Lib) {
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
            parse_symbol_name(
                symbol_name,
                matches!(self.options.mode, EmitMode::Dev | EmitMode::Lib),
            )
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
        if self.options.is_inline {
            self.create_inline_qrl(hook_data, folded, symbol_name, span)
        } else {
            self.create_hook(hook_data, folded, symbol_name, span, 0)
        }
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
            .partition(|(_, t)| matches!(t, IdentType::Var(_)));

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
        let hook_data = HookData {
            extension: self.options.extension.clone(),
            local_idents,
            scoped_idents,
            parent_hook: self.hook_stack.last().cloned(),
            ctx_kind,
            ctx_name,
            origin: self.options.path_data.rel_path.to_slash_lossy().into(),
            display_name,
            need_transform: true,
            hash,
        };
        if self.options.is_inline {
            let folded = if !hook_data.scoped_idents.is_empty() {
                let new_local =
                    self.ensure_import(USE_LEXICAL_SCOPE.clone(), BUILDER_IO_QWIK.clone());
                transform_function_expr(folded, &new_local, &hook_data.scoped_idents)
            } else {
                folded
            };
            self.create_inline_qrl(hook_data, folded, symbol_name, span)
        } else {
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
                &hook_data.hash,
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

        let o = self.create_qrl(import_path, &symbol_name, &hook_data, &span);
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
        let mut is_fn = false;
        let first_arg = node.args.first();
        if let Some(name) = first_arg {
            match &*name.expr {
                ast::Expr::Lit(ast::Lit::Str(str)) => {
                    self.stack_ctxt.push(str.value.to_string());
                    name_token = true;
                }
                ast::Expr::Ident(ident) => {
                    is_fn = true;
                    self.stack_ctxt.push(ident.sym.to_string());
                    name_token = true;
                }
                _ => {}
            }
        }
        let o = ast::CallExpr {
            callee: node.callee.fold_with(self),
            args: node
                .args
                .into_iter()
                .enumerate()
                .map(|(i, arg)| {
                    if i == 1 {
                        self.handle_jsx_props_obj(is_fn, arg)
                    } else {
                        arg.fold_with(self)
                    }
                })
                .collect(),
            ..node
        };
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

    fn create_qrl(
        &mut self,
        url: JsWord,
        symbol: &str,
        data: &HookData,
        span: &Span,
    ) -> ast::CallExpr {
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
        let fn_callee = if self.options.mode == EmitMode::Dev {
            args.push(get_qrl_dev_obj(
                &self.options.path_data.abs_path,
                data,
                span,
            ));
            _QRL_DEV.clone()
        } else {
            _QRL.clone()
        };

        // Injects state
        if !data.scoped_idents.is_empty() {
            args.push(ast::Expr::Array(ast::ArrayLit {
                span: DUMMY_SP,
                elems: data
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

        self.create_internal_call(fn_callee, args)
    }

    fn create_inline_qrl(
        &mut self,
        hook_data: HookData,
        expr: ast::Expr,
        symbol_name: JsWord,
        span: Span,
    ) -> ast::CallExpr {
        let mut args = vec![
            expr,
            ast::Expr::Lit(ast::Lit::Str(ast::Str {
                span: DUMMY_SP,
                value: symbol_name,
                raw: None,
            })),
        ];

        let fn_callee = if self.options.mode == EmitMode::Dev {
            args.push(get_qrl_dev_obj(
                &self.options.path_data.abs_path,
                &hook_data,
                &span,
            ));
            _INLINED_QRL_DEV.clone()
        } else {
            _INLINED_QRL.clone()
        };

        // Injects state
        if !hook_data.scoped_idents.is_empty() {
            args.push(ast::Expr::Array(ast::ArrayLit {
                span: DUMMY_SP,
                elems: hook_data
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

        self.create_internal_call(fn_callee, args)
    }

    pub fn create_internal_call(
        &mut self,
        fn_name: JsWord,
        exprs: Vec<ast::Expr>,
    ) -> ast::CallExpr {
        let local = self.ensure_import(fn_name, BUILDER_IO_QWIK.clone());
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

    fn handle_jsx_props_obj(&mut self, is_fn: bool, expr: ast::ExprOrSpread) -> ast::ExprOrSpread {
        match expr {
            ast::ExprOrSpread {
                expr: box ast::Expr::Object(object),
                ..
            } => {
                let mut immutable_props = vec![];
                let mut new_props = vec![];
                let mut has_immutable = false;
                for prop in object.props {
                    let mut name_token = false;
                    let prop = match prop {
                        ast::PropOrSpread::Prop(box ast::Prop::KeyValue(ref node)) => {
                            let key_word = match node.key {
                                ast::PropName::Ident(ref ident) => Some(ident.sym.clone()),
                                ast::PropName::Str(ref s) => Some(s.value.clone()),
                                _ => {
                                    has_immutable = true;
                                    None
                                }
                            };
                            if let Some(key_word) = key_word {
                                let is_children = key_word == *CHILDREN;
                                if !is_children {
                                    self.stack_ctxt.push(key_word.to_string());
                                    name_token = true;
                                }

                                if convert_signal_word(&key_word).is_some() {
                                    if matches!(*node.value, ast::Expr::Arrow(_) | ast::Expr::Fn(_))
                                    {
                                        if is_fn {
                                            immutable_props.push(ast::PropOrSpread::Prop(
                                                Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
                                                    key: node.key.clone(),
                                                    value: Box::new(ast::Expr::Lit(
                                                        ast::Lit::Bool(ast::Bool::from(true)),
                                                    )),
                                                })),
                                            ));
                                        }
                                        ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(
                                            ast::KeyValueProp {
                                                value: Box::new(ast::Expr::Call(
                                                    self.create_synthetic_qhook(
                                                        *node.value.clone(),
                                                        HookKind::Event,
                                                        key_word.clone(),
                                                        None,
                                                    ),
                                                )),
                                                key: node.key.clone(),
                                            },
                                        )))
                                    } else {
                                        prop
                                    }
                                } else if is_children {
                                    if let Some(immutable) = is_immutable_children(&node.value) {
                                        immutable_props.push(ast::PropOrSpread::Prop(Box::new(
                                            ast::Prop::KeyValue(ast::KeyValueProp {
                                                key: node.key.clone(),
                                                value: Box::new(ast::Expr::Lit(ast::Lit::Bool(
                                                    ast::Bool::from(immutable),
                                                ))),
                                            }),
                                        )));
                                    }
                                    if let Some(new_children) = self.convert_children(&node.value) {
                                        ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(
                                            ast::KeyValueProp {
                                                value: Box::new(new_children),
                                                key: node.key.clone(),
                                            },
                                        )))
                                    } else {
                                        prop
                                    }
                                } else if let Some(getter) = self.convert_to_getter(&node.value) {
                                    immutable_props.push(ast::PropOrSpread::Prop(Box::new(
                                        ast::Prop::KeyValue(ast::KeyValueProp {
                                            key: node.key.clone(),
                                            value: Box::new(getter),
                                        }),
                                    )));
                                    ast::PropOrSpread::Prop(Box::new(ast::Prop::Getter(
                                        ast::GetterProp {
                                            span: DUMMY_SP,
                                            type_ann: None,
                                            key: node.key.clone(),
                                            body: Some(ast::BlockStmt {
                                                span: DUMMY_SP,
                                                stmts: vec![ast::Stmt::Return(ast::ReturnStmt {
                                                    span: DUMMY_SP,
                                                    arg: Some(node.value.clone()),
                                                })],
                                            }),
                                        },
                                    )))
                                } else if is_fn
                                    && is_immutable_expr(
                                        &node.value,
                                        &key_word,
                                        &self.options.global_collect,
                                        self.decl_stack.last(),
                                    )
                                {
                                    immutable_props.push(ast::PropOrSpread::Prop(Box::new(
                                        ast::Prop::KeyValue(ast::KeyValueProp {
                                            key: node.key.clone(),
                                            value: Box::new(ast::Expr::Lit(ast::Lit::Bool(
                                                ast::Bool::from(true),
                                            ))),
                                        }),
                                    )));
                                    prop
                                } else {
                                    prop
                                }
                            } else {
                                prop
                            }
                        }
                        prop => prop,
                    };

                    let prop = prop.fold_children_with(self);
                    if name_token {
                        self.stack_ctxt.pop();
                    }
                    new_props.push(prop);
                }
                if !has_immutable && !immutable_props.is_empty() {
                    new_props.push(ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(
                        ast::KeyValueProp {
                            key: ast::PropName::Computed(ast::ComputedPropName {
                                span: DUMMY_SP,
                                expr: Box::new(ast::Expr::Ident(new_ident_from_id(
                                    &self
                                        .ensure_import(_IMMUTABLE.clone(), BUILDER_IO_QWIK.clone()),
                                ))),
                            }),
                            value: Box::new(ast::Expr::Object(ast::ObjectLit {
                                props: immutable_props,
                                span: DUMMY_SP,
                            })),
                        },
                    ))))
                }
                ast::ExprOrSpread {
                    spread: None,
                    expr: Box::new(ast::Expr::Object(ast::ObjectLit {
                        props: new_props,
                        ..object
                    })),
                }
            }
            _ => expr,
        }
    }

    fn convert_children(&mut self, expr: &ast::Expr) -> Option<ast::Expr> {
        if let Some(expr) = self.convert_to_getter(expr) {
            return Some(expr);
        }
        match expr {
            ast::Expr::Array(array) => Some(ast::Expr::Array(ast::ArrayLit {
                span: array.span,
                elems: array
                    .elems
                    .iter()
                    .map(|e| {
                        if let Some(e) = e {
                            if let Some(new) = self.convert_to_getter(&e.expr) {
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
            _ => None,
        }
    }

    fn convert_to_getter(&mut self, expr: &ast::Expr) -> Option<ast::Expr> {
        if let ast::Expr::Member(member) = expr {
            let prop_sym = prop_to_string(&member.prop);
            if let Some(prop_sym) = prop_sym {
                let id = self.ensure_import(JsWord::from("_wrapSignal"), BUILDER_IO_QWIK.clone());
                return Some(make_wrap(&id, member.obj.clone(), prop_sym));
            }
        }
        None
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
    fn fold_var_decl(&mut self, node: ast::VarDecl) -> ast::VarDecl {
        if let Some(current_scope) = self.decl_stack.last_mut() {
            let ident_type = if node.kind == ast::VarDeclKind::Const {
                IdentType::Var(true)
            } else {
                IdentType::Var(false)
            };
            let mut identifiers = Vec::with_capacity(node.decls.len() + 2);
            for decl in &node.decls {
                collect_from_pat(&decl.name, &mut identifiers);
            }
            current_scope.extend(identifiers.into_iter().map(|(id, _)| (id, ident_type)));
        }
        node.fold_children_with(self)
    }

    fn fold_var_declarator(&mut self, node: ast::VarDeclarator) -> ast::VarDeclarator {
        let mut stacked = false;
        if let ast::Pat::Ident(ref ident) = node.name {
            self.stack_ctxt.push(ident.id.sym.to_string());
            stacked = true;
        }
        // if let Some(current_scope) = self.decl_stack.last_mut() {
        //     let mut identifiers = vec![];
        //     collect_from_pat(&node.name, &mut identifiers);
        //     current_scope.extend(identifiers.into_iter().map(|(id, _)| (id, IdentType::Var)));
        // }
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
                    .map(|(key, _)| (key, IdentType::Var(false))),
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
            current_scope.extend(
                identifiers
                    .into_iter()
                    .map(|(id, _)| (id, IdentType::Var(false))),
            );
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
        let node = match node.name {
            ast::JSXAttrName::Ident(ref ident) => {
                let new_word = convert_signal_word(&ident.sym);
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
                let new_word = convert_signal_word(&namespaced.name.sym);
                let ident_name = [
                    namespaced.ns.sym.as_ref(),
                    "-",
                    namespaced.name.sym.as_ref(),
                ]
                .concat();
                self.stack_ctxt.push(ident_name.clone());
                if new_word.is_some() {
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
            ast::Callee::Expr(box ast::Expr::Ident(ident)) => {
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
                        let new_specifier =
                            convert_signal_word(&import.specifier).expect("Specifier ends with $");
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

pub fn add_handle_watch(body: &mut Vec<ast::ModuleItem>) {
    body.push(ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportNamed(
        ast::NamedExport {
            src: Some(Box::new(ast::Str {
                span: DUMMY_SP,
                value: BUILDER_IO_QWIK.clone(),
                raw: None,
            })),
            span: DUMMY_SP,
            asserts: None,
            type_only: false,
            specifiers: vec![ast::ExportSpecifier::Named(ast::ExportNamedSpecifier {
                orig: ast::ModuleExportName::Ident(ast::Ident::new(HANDLE_WATCH.clone(), DUMMY_SP)),
                exported: None,
                is_type_only: false,
                span: DUMMY_SP,
            })],
        },
    )));
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
        src: Box::new(ast::Str {
            span: DUMMY_SP,
            value: src.clone(),
            raw: None,
        }),
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

fn get_qrl_dev_obj(asb_path: &Path, hook: &HookData, span: &Span) -> ast::Expr {
    ast::Expr::Object(ast::ObjectLit {
        span: DUMMY_SP,
        props: vec![
            ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
                key: ast::PropName::Ident(ast::Ident::new(js_word!("file"), DUMMY_SP)),
                value: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
                    span: DUMMY_SP,
                    value: asb_path.to_str().unwrap().into(),
                    raw: None,
                }))),
            }))),
            ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
                key: ast::PropName::Ident(ast::Ident::new(JsWord::from("lo"), DUMMY_SP)),
                value: Box::new(ast::Expr::Lit(ast::Lit::Num(ast::Number {
                    span: DUMMY_SP,
                    value: span.lo().0 as f64,
                    raw: None,
                }))),
            }))),
            ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
                key: ast::PropName::Ident(ast::Ident::new(JsWord::from("hi"), DUMMY_SP)),
                value: Box::new(ast::Expr::Lit(ast::Lit::Num(ast::Number {
                    span: DUMMY_SP,
                    value: span.hi().0 as f64,
                    raw: None,
                }))),
            }))),
            ast::PropOrSpread::Prop(Box::new(ast::Prop::KeyValue(ast::KeyValueProp {
                key: ast::PropName::Ident(ast::Ident::new(JsWord::from("displayName"), DUMMY_SP)),
                value: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
                    span: DUMMY_SP,
                    value: hook.display_name.clone(),
                    raw: None,
                }))),
            }))),
        ],
    })
}

fn prop_to_string(prop: &ast::MemberProp) -> Option<JsWord> {
    match prop {
        ast::MemberProp::Ident(ident) => Some(ident.sym.clone()),
        ast::MemberProp::Computed(ast::ComputedPropName {
            expr: box ast::Expr::Lit(ast::Lit::Str(str)),
            ..
        }) => Some(str.value.clone()),
        _ => None,
    }
}

fn make_wrap(method: &Id, obj: Box<ast::Expr>, prop: JsWord) -> ast::Expr {
    ast::Expr::Call(ast::CallExpr {
        callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(method)))),
        args: vec![
            ast::ExprOrSpread::from(obj),
            ast::ExprOrSpread::from(Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str::from(
                prop,
            ))))),
        ],
        span: DUMMY_SP,
        type_args: None,
    })
}
