use std::collections::HashSet;

use crate::code_move::fix_path;
use crate::collector::HookCollect;
use crate::entry_strategy::EntryPolicy;
use crate::parse::PathData;
use anyhow::{bail, Error};
use lazy_static::lazy_static;
use regex::Regex;
use std::sync::{Arc, Mutex};
use swc_atoms::JsWord;
use swc_common::comments::{Comments, SingleThreadedComments};
use swc_common::{errors::HANDLER, Span, DUMMY_SP};
use swc_ecmascript::ast;
use swc_ecmascript::visit::{noop_fold_type, Fold, FoldWith};

lazy_static! {
    static ref QHOOK: JsWord = JsWord::from("qHook");
    static ref QCOMPONENT: JsWord = JsWord::from("qComponent");
}

#[derive(Debug)]
pub struct Hook {
    pub entry: Option<JsWord>,
    pub canonical_filename: String,
    pub name: String,
    pub expr: ast::CallExpr,
    pub local_decl: Vec<JsWord>,
    pub local_idents: Vec<JsWord>,
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

#[allow(clippy::module_name_repetitions)]
pub struct HookTransform<'a> {
    stack_ctxt: Vec<String>,

    root_sym: Option<String>,
    context: ThreadSafeTransformContext,
    hooks: &'a mut Vec<Hook>,

    path_data: &'a PathData,

    comments: Option<&'a SingleThreadedComments>,
    entry_policy: &'a dyn EntryPolicy,
}

impl<'a> HookTransform<'a> {
    pub fn new(
        context: ThreadSafeTransformContext,
        path_data: &'a PathData,
        entry_policy: &'a dyn EntryPolicy,
        comments: Option<&'a SingleThreadedComments>,
        hooks: &'a mut Vec<Hook>,
    ) -> Self {
        HookTransform {
            path_data,
            stack_ctxt: Vec::with_capacity(16),
            hooks,
            root_sym: None,
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

    fn handle_var_decl(&mut self, node: ast::VarDecl) -> ast::VarDecl {
        let mut newdecls = vec![];
        for decl in node.decls {
            match decl.name {
                ast::Pat::Ident(ref ident) => {
                    self.root_sym = Some(ident.id.to_string());
                }
                _ => {
                    self.root_sym = None;
                }
            }
            newdecls.push(decl.fold_with(self));
        }
        ast::VarDecl {
            span: DUMMY_SP,
            kind: node.kind,
            decls: newdecls,
            declare: node.declare,
        }
    }
}

impl<'a> Fold for HookTransform<'a> {
    noop_fold_type!();

    fn fold_module_item(&mut self, item: ast::ModuleItem) -> ast::ModuleItem {
        match item {
            ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(node))) => {
                ast::ModuleItem::Stmt(ast::Stmt::Decl(ast::Decl::Var(self.handle_var_decl(node))))
            }
            ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(node)) => match node.decl {
                ast::Decl::Var(var) => {
                    ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(ast::ExportDecl {
                        span: DUMMY_SP,
                        decl: ast::Decl::Var(self.handle_var_decl(var)),
                    }))
                }
                ast::Decl::Class(class) => {
                    self.root_sym = Some(class.ident.sym.to_string());
                    ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(ast::ExportDecl {
                        span: DUMMY_SP,
                        decl: ast::Decl::Class(class.fold_with(self)),
                    }))
                }
                ast::Decl::Fn(function) => {
                    self.root_sym = Some(function.ident.sym.to_string());
                    ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(ast::ExportDecl {
                        span: DUMMY_SP,
                        decl: ast::Decl::Fn(function.fold_with(self)),
                    }))
                }
                other => {
                    ast::ModuleItem::ModuleDecl(ast::ModuleDecl::ExportDecl(ast::ExportDecl {
                        span: DUMMY_SP,
                        decl: other.fold_with(self),
                    }))
                }
            },

            item => item.fold_children_with(self),
        }
    }

    fn fold_var_declarator(&mut self, node: ast::VarDeclarator) -> ast::VarDeclarator {
        let mut stacked = false;
        if let ast::Pat::Ident(ref ident) = node.name {
            self.stack_ctxt.push(ident.id.sym.to_string());
            stacked = true;
        };
        let o = node.fold_children_with(self);
        if stacked {
            self.stack_ctxt.pop();
        }
        o
    }

    fn fold_fn_decl(&mut self, node: ast::FnDecl) -> ast::FnDecl {
        self.stack_ctxt.push(node.ident.sym.to_string());
        let o = node.fold_children_with(self);
        self.stack_ctxt.pop();

        o
    }

    fn fold_class_decl(&mut self, node: ast::ClassDecl) -> ast::ClassDecl {
        self.stack_ctxt.push(node.ident.sym.to_string());
        let o = node.fold_children_with(self);
        self.stack_ctxt.pop();

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
            stacked = true;
        }
        if let ast::PropName::Str(ref s) = node.key {
            self.stack_ctxt.push(s.value.to_string());
            stacked = true;
        }
        let o = node.fold_children_with(self);
        if stacked {
            self.stack_ctxt.pop();
        }
        o
    }

    fn fold_jsx_attr(&mut self, node: ast::JSXAttr) -> ast::JSXAttr {
        let mut stacked = false;
        if let ast::JSXAttrName::Ident(ref ident) = node.name {
            self.stack_ctxt.push(ident.sym.to_string());
            stacked = true;
        }
        let o = node.fold_children_with(self);
        if stacked {
            self.stack_ctxt.pop();
        }
        o
    }

    fn fold_call_expr(&mut self, node: ast::CallExpr) -> ast::CallExpr {
        if let ast::ExprOrSuper::Expr(expr) = &node.callee {
            if let ast::Expr::Ident(id) = &**expr {
                let qhook_span = id.span;
                if QCOMPONENT.eq(&id.sym) {
                    if let Some(comments) = self.comments {
                        comments.add_pure_comment(node.span.lo);
                    }
                } else if id.sym == *QHOOK {
                    let mut node = node;
                    let mut user_symbol = None;
                    if let Some(second_arg) = node.args.get(1) {
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

                    // Remove last arguments
                    node.args.drain(1..);

                    let folded = node.fold_children_with(self);
                    let hook_collect = HookCollect::new(&folded);
                    let entry = self.entry_policy.get_entry_for_sym(
                        &symbol_name,
                        self.path_data,
                        &self.stack_ctxt,
                        &hook_collect,
                        &folded,
                    );

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

                    let (local_decl, local_idents) = hook_collect.get_words();
                    self.hooks.push(Hook {
                        entry,
                        canonical_filename,
                        name: symbol_name.clone(),
                        expr: folded,
                        local_decl,
                        local_idents,
                        origin: self.path_data.path.to_string_lossy().into(),
                    });

                    return create_inline_qhook(import_path, &symbol_name, qhook_span);
                }
            }
        }

        node.fold_children_with(self)
    }
}

fn create_inline_qhook(url: JsWord, symbol: &str, span: Span) -> ast::CallExpr {
    ast::CallExpr {
        callee: ast::ExprOrSuper::Expr(Box::new(ast::Expr::Ident(ast::Ident::new(
            QHOOK.clone(),
            span,
        )))),
        span: DUMMY_SP,
        type_args: None,
        args: vec![
            ast::ExprOrSpread {
                spread: None,
                expr: Box::new(ast::Expr::Arrow(ast::ArrowExpr {
                    is_async: false,
                    is_generator: false,
                    span: DUMMY_SP,
                    params: vec![],
                    return_type: None,
                    type_params: None,
                    body: ast::BlockStmtOrExpr::Expr(Box::new(ast::Expr::Call(ast::CallExpr {
                        callee: ast::ExprOrSuper::Expr(Box::new(ast::Expr::Ident(
                            ast::Ident::new("import".into(), DUMMY_SP),
                        ))),
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
                })),
            },
            ast::ExprOrSpread {
                spread: None,
                expr: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
                    span: DUMMY_SP,
                    value: symbol.into(),
                    has_escape: false,
                    kind: ast::StrKind::Synthesized,
                }))),
            },
        ],
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
