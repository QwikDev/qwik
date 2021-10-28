use std::vec;

use ast::*;
use std::collections::HashSet;
use swc_common::DUMMY_SP;
use swc_atoms::JsWord;
use swc_ecmascript::ast;
use swc_ecmascript::ast::{ExportDecl, Expr, Ident, VarDeclarator};
use swc_ecmascript::visit::{noop_fold_type, Fold, FoldWith};

struct HookMeta {
    name: String,
    module_index: usize,
    expr: Box<Expr>,
}

#[derive(Default)]
pub struct HookTransform {
    stack_ctxt: Vec<String>,
    hooks_names: HashSet<String>,
    hooks: Vec<HookMeta>,
    module_item: usize,
    root_sym: Option<String>,
}

impl HookTransform {
    fn get_context_name(&self) -> String {
        let mut ctx = self.stack_ctxt.join("_") + "_h";
        if self.hooks_names.contains(&ctx) {
            ctx += &self.hooks.len().to_string();
        }
        return ctx;
    }

    fn handle_var_decl(&mut self, node: VarDecl) -> VarDecl {
        let mut newdecls = vec![];
        for decl in node.decls {
            match decl.name {
                Pat::Ident(ref ident) => {
                    self.root_sym = Some(ident.id.to_string());
                }
                _ => {
                    self.root_sym = None;
                }
            }
            newdecls.push(decl.fold_with(self));
        }
        VarDecl {
            span: DUMMY_SP,
            kind: node.kind,
            decls: newdecls,
            declare: node.declare,
        }
    }
}


impl Fold for HookTransform {
    noop_fold_type!();

    fn fold_module(&mut self, node: Module) -> Module {
        let mut node = node;
        let mut module_body = vec![];
        self.module_item = 0;
        for item in node.body {
            self.root_sym = None;
            let new_item = match item {
                ModuleItem::Stmt(Stmt::Decl(Decl::Var(node))) => {
                    let transformed = self.handle_var_decl(node);
                    ModuleItem::Stmt(Stmt::Decl(Decl::Var(transformed)))
                }
                ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(node)) => {
                    match node.decl {
                        Decl::Var(var) => {
                            let transformed = self.handle_var_decl(var);
                            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl{
                                span: DUMMY_SP,
                                decl: Decl::Var(transformed)
                            }))
                        }
                        Decl::Class(class) => {
                            self.root_sym = Some(class.ident.sym.to_string());
                            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl{
                                span: DUMMY_SP,
                                decl: Decl::Class(class.fold_with(self))
                            }))
                        }
                        Decl::Fn(function) => {
                            self.root_sym = Some(function.ident.sym.to_string());
                            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl{
                                span: DUMMY_SP,
                                decl: Decl::Fn(function.fold_with(self))
                            }))
                        }
                        other => {
                            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl{
                                span: DUMMY_SP,
                                decl: other.fold_with(self)
                            }))
                        }
                    }
                }

                item => {
                    item.fold_with(self)
                }
            };
            module_body.push(new_item);
            self.module_item += 1;
        }

        self.hooks.sort_by(|a, b| b.module_index.cmp(&a.module_index));
        for hook in &self.hooks {
            module_body.insert(hook.module_index, create_named_export(&hook));
        }
        node.body = module_body;
        return node;
    }

    fn fold_var_declarator(&mut self, node: VarDeclarator) -> VarDeclarator {
        let mut stacked = false;

        if let Pat::Ident(ref ident) = node.name {
            self.stack_ctxt.push(ident.id.sym.to_string());
            stacked = true;
        }
        let o = node.fold_children_with(self);
        if stacked {
            self.stack_ctxt.pop();
        }
        return o;
    }

    fn fold_fn_decl(&mut self, node: FnDecl) -> FnDecl {
        self.stack_ctxt.push(node.ident.sym.to_string());
        let o = node.fold_children_with(self);
        self.stack_ctxt.pop();

        return o;
    }


    fn fold_jsx_opening_element(&mut self, node: JSXOpeningElement) -> JSXOpeningElement {
        let mut stacked = false;

        if let JSXElementName::Ident(ref ident) = node.name {
            self.stack_ctxt.push(ident.sym.to_string());
            stacked = true;
        }
        let o = node.fold_children_with(self);
        if stacked {
            self.stack_ctxt.pop();
        }
        return o;
    }

    fn fold_key_value_prop(&mut self, node: KeyValueProp) -> KeyValueProp {
        let mut stacked = false;
        if let PropName::Ident(ref ident) = node.key {
            self.stack_ctxt.push(ident.sym.to_string());
            stacked = true;
        }
        if let PropName::Str(ref s) = node.key {
            self.stack_ctxt.push(s.value.to_string());
            stacked = true;
        }
        let o = node.fold_children_with(self);
        if stacked {
            self.stack_ctxt.pop();
        }
        return o;
    }

    fn fold_jsx_attr(&mut self, node: JSXAttr) -> JSXAttr {
        let mut stacked = false;
        if let JSXAttrName::Ident(ref ident) = node.name {
            self.stack_ctxt.push(ident.sym.to_string());
            stacked = true;
        }
        let o = node.fold_children_with(self);
        if stacked {
            self.stack_ctxt.pop();
        }
        return o;
    }

    fn fold_call_expr(&mut self, node: CallExpr) -> CallExpr {
        let folded = node.fold_children_with(self);
        if let ExprOrSuper::Expr(expr) = &folded.callee {
            if let Expr::Ident(id) = &**expr {
                if id.sym == swc_atoms::JsWord::from("qHook") {
                    let name = self.get_context_name();
                    self.hooks.push(HookMeta {
                        name: name.clone(),
                        module_index: self.module_item,
                        expr: Box::new(Expr::Call(folded.clone())),
                    });
                    self.hooks_names.insert(name.clone());
                    return create_inline_qhook(&name);
                }
            }
        }
        return folded;
    }
}

fn create_inline_qhook(q_url: &str) -> CallExpr {
    CallExpr {
        callee: ast::ExprOrSuper::Expr(Box::new(Expr::Ident(Ident::new("qHook".into(), DUMMY_SP)))),
        args: vec![ExprOrSpread {
            expr: Box::new(Expr::Lit(ast::Lit::Str(ast::Str {
                span: DUMMY_SP,
                value: q_url.into(),
                has_escape: false,
                kind: ast::StrKind::Synthesized,
            }))),
            spread: None,
        }],
        span: DUMMY_SP,
        type_args: None,
    }
}

fn create_named_export(hook: &HookMeta) -> ModuleItem {
    ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
        span: DUMMY_SP,
        decl: Decl::Var(VarDecl {
            span: DUMMY_SP,
            kind: VarDeclKind::Const,
            declare: false,
            decls: vec![VarDeclarator {
                span: DUMMY_SP,
                definite: false,
                name: Pat::Ident(BindingIdent::from(Ident::new(
                    hook.name.clone().into(),
                    DUMMY_SP,
                ))),
                init: Some(hook.expr.clone()),
            }],
        }),
    }))
}
