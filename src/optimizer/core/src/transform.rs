use std::vec;

use ast::*;
use swc_common::DUMMY_SP;
use swc_ecmascript::ast;
use swc_ecmascript::ast::{ExportDecl, Expr, Ident, VarDeclarator};
use swc_ecmascript::visit::{Fold, FoldWith};

struct HookMeta {
    expr: Box<Expr>,
    name: String,
}

#[derive(Default)]
pub struct HookTransform {
    stack_ctxt: Vec<String>,
    hooks: Vec<HookMeta>,
}

impl Fold for HookTransform {
    fn fold_module(&mut self, node: Module) -> Module {
        let mut node = node;
        let mut module_body = vec![];

        for item in node.body {
            // if let ModuleItem::Stmt(Stmt::Decl(Decl::Var(var))) = item {
            //     let mut newdecls = vec![];
            //     for decl in var.decls {
            //         if let Pat::Ident(ident) = &decl.name {
            //             self.stack_ctxt.push(ident.id.to_string());
            //             newdecls.push(decl.fold_with(self));
            //             self.stack_ctxt.pop();
            //         } else {
            //             newdecls.push(decl);
            //         }
            //     }

            //     module_body.push(ModuleItem::Stmt(Stmt::Decl(Decl::Var(VarDecl {
            //         span: DUMMY_SP,
            //         kind: var.kind,
            //         decls: newdecls,
            //         declare: var.declare,
            //     }))));
            // } else {
            //     module_body.push(item);
            // }
            module_body.push(item.fold_with(self));
        }
        for hook in &self.hooks {
            module_body.push(create_named_export(&hook));
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
                if id.sym.to_string() == "qHook" {
                    let name = self.stack_ctxt.join("_");
                    self.hooks.push(HookMeta {
                        expr: Box::new(Expr::Call(folded.clone())),
                        name: name.clone(),
                    });
                    return create_inline_qhook(name);
                }
            }
        }
        return folded;
    }
}

fn create_inline_qhook(q_url: String) -> CallExpr {
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
