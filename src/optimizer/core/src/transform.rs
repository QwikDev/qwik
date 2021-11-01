use std::vec;
use ast::*;
use std::collections::HashSet;
use swc_atoms::JsWord;
use swc_common::{DUMMY_SP, sync::Lrc, SourceMap};
use swc_ecmascript::ast;
use swc_ecmascript::ast::{ExportDecl, Expr, Ident, VarDeclarator};
use swc_ecmascript::visit::{noop_fold_type, Fold, FoldWith};
use serde::{Deserialize, Serialize};
use crate::collector::HookCollect;


#[derive(Debug)]
pub struct Hook {
    pub filename: String,
    pub name: String,
    pub module_index: usize,
    pub expr: Box<Expr>,
    pub hook_collect: HookCollect,
}

pub struct TransformContext {
    pub source_map: Lrc<SourceMap>,
    pub hooks_names: HashSet<String>,
}

impl TransformContext {
    pub fn new() -> TransformContext {
        TransformContext{
            hooks_names: HashSet::with_capacity(10),
            source_map: Lrc::new(SourceMap::default())
        }
    }
}

pub struct HookTransform<'a> {
    stack_ctxt: Vec<String>,
    module_item: usize,

    root_sym: Option<String>,
    context: &'a mut TransformContext,

    hooks: &'a mut Vec<Hook>,

    filename: &'a str,
}

impl<'a> HookTransform<'a> {
    pub fn new(ctx: &'a mut TransformContext, filename: &'a str, hooks: &'a mut Vec<Hook>) -> Self {
        HookTransform{
            filename: filename,
            stack_ctxt: vec![],
            hooks: hooks,
            module_item: 0,
            root_sym: None,
            context: ctx,
        }
    }

    fn get_context_name(&self) -> String {
        let mut ctx = self.stack_ctxt.join("_") + "_h";
        if self.context.hooks_names.contains(&ctx) {
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

impl<'a> Fold for HookTransform<'a> {
    noop_fold_type!();

    fn fold_module(&mut self, node: Module) -> Module {
        let o = node.fold_children_with(self);
        self.hooks.sort_by(|a, b| b.module_index.cmp(&a.module_index));
        return o;
    }

    fn fold_module_item(&mut self, item: ModuleItem) -> ModuleItem {
        let item = match item {
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
                item.fold_children_with(self)
            }
        };
        self.module_item += 1;
        return item;
    }

    fn fold_var_declarator(&mut self, node: VarDeclarator) -> VarDeclarator {
        let mut stacked = false;

        match node.name {
            Pat::Ident(ref ident) => {
                self.stack_ctxt.push(ident.id.sym.to_string());
                stacked = true;
            }
            _ => {}
        };
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

    fn fold_class_decl(&mut self, node: ClassDecl) -> ClassDecl {
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
        if let ExprOrSuper::Expr(expr) = &node.callee {
            if let Expr::Ident(id) = &**expr {
                if id.sym == swc_atoms::JsWord::from("qHook") {
                    let symbol_name = self.get_context_name();
                    let filename = format!("h_{}.js", self.filename);
                    let qurl = format!("{}#{}", filename, symbol_name);
                    let hook_collect = HookCollect::new(&node);
                    let folded = node.fold_children_with(self);
                    self.hooks.push(Hook {
                        filename:  filename,
                        name: symbol_name.clone(),
                        module_index: self.module_item,
                        expr: Box::new(Expr::Call(folded.clone())),
                        hook_collect: hook_collect,
                    });
                    self.context.hooks_names.insert(symbol_name.clone());
                    return create_inline_qhook(&qurl);
                }
            }
        }
        let folded = node.fold_children_with(self);
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
