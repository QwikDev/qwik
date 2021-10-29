use std::vec;
use ast::*;
use std::collections::HashSet;
use swc_atoms::JsWord;
use swc_common::{DUMMY_SP, sync::Lrc, SourceMap};
use swc_ecmascript::ast;
use swc_ecmascript::ast::{ExportDecl, Expr, Ident, VarDeclarator};
use swc_ecmascript::visit::{noop_fold_type, Fold, FoldWith};
use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Hook {
    name: String,
    local_decl: Vec<String>,
    local_idents: Vec<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct HookAnalysis {
    local_decl: HashSet<JsWord>,
    local_idents: HashSet<JsWord>,
}

#[derive(Debug)]
pub struct HookMeta {
    name: String,
    module_index: usize,
    expr: Box<Expr>,
    scope_analysis: HookAnalysis,
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
    hook_ctx: Vec<HookAnalysis>,
    module_item: usize,

    root_sym: Option<String>,
    context: &'a mut TransformContext,

    hooks: Vec<HookMeta>,

    hooks_output: &'a mut Vec<Hook>,
}

trait VecExt {
    fn sorted(self) -> Self;
}

impl<'a> HookTransform<'a> {
    pub fn new(ctx: &'a mut TransformContext, hooks: &'a mut Vec<Hook>) -> Self {
        HookTransform{
            stack_ctxt: vec![],
            hook_ctx: vec![],
            hooks: vec![],
            module_item: 0,
            root_sym: None,
            context: ctx,
            hooks_output: hooks,
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
            let mut hook_output = Hook{
                name: hook.name.clone(),
                local_decl: hook.scope_analysis.local_decl.iter().map(|d| d.to_string()).collect(),
                local_idents: hook.scope_analysis.local_idents.iter().map(|d| d.to_string()).collect(),
            };
            hook_output.local_decl.sort();
            hook_output.local_idents.sort();

            self.hooks_output.push(hook_output);
        }
        node.body = module_body;
        return node;
    }

    fn fold_var_declarator(&mut self, node: VarDeclarator) -> VarDeclarator {
        let mut stacked = false;

        match node.name {
            Pat::Ident(ref ident) => {
                self.stack_ctxt.push(ident.id.sym.to_string());
                stacked = true;
                if let Some(current_hook) = self.hook_ctx.last_mut() {
                    current_hook.local_decl.insert(ident.id.sym.clone());
                }
            }
            Pat::Object(ref obj) => {
                if let Some(current_hook) = self.hook_ctx.last_mut() {
                    for prop in &obj.props {
                        match prop {
                            ObjectPatProp::Assign(ref v) => {
                                if let Some(Expr::Ident(ident)) = v.value.as_deref() {
                                    current_hook.local_decl.insert(ident.sym.clone());
                                } else {
                                    current_hook.local_decl.insert(v.key.sym.clone());
                                }
                            }
                            ObjectPatProp::KeyValue(ref v) => {
                                if let Pat::Ident(ident) = v.value.as_ref() {
                                    current_hook.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                            ObjectPatProp::Rest(ref v) => {
                                if let Pat::Ident(ident) = v.arg.as_ref() {
                                    current_hook.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                        }
                    }
                }
            }
            Pat::Array(ref arr) => {
                if let Some(current_hook) = self.hook_ctx.last_mut() {
                    for el in &arr.elems {
                        match el {
                            Some(Pat::Ident(ref ident)) => {
                                current_hook.local_decl.insert(ident.id.sym.clone());
                            }
                            Some(Pat::Rest(ref rest)) => {
                                if let Pat::Ident(ref ident) = *rest.arg {
                                    current_hook.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            _ => {}
        };
        let o = node.fold_children_with(self);
        if stacked {
            self.stack_ctxt.pop();
        }
        return o;
    }

    fn fold_arrow_expr(&mut self, node: ArrowExpr) -> ArrowExpr {
        if let Some(current_hook) = self.hook_ctx.last_mut() {
            for param in &node.params {
                match param {
                    Pat::Ident(ref ident) => {
                        current_hook.local_decl.insert(ident.id.sym.clone());
                    }
                    Pat::Object(ref obj) => {
                        for prop in &obj.props {
                            match prop {
                                ObjectPatProp::Assign(ref v) => {
                                    if let Some(Expr::Ident(ident)) = v.value.as_deref() {
                                        current_hook.local_decl.insert(ident.sym.clone());
                                    } else {
                                        current_hook.local_decl.insert(v.key.sym.clone());
                                    }
                                }
                                ObjectPatProp::KeyValue(ref v) => {
                                    if let Pat::Ident(ident) = v.value.as_ref() {
                                        current_hook.local_decl.insert(ident.id.sym.clone());
                                    }
                                }
                                ObjectPatProp::Rest(ref v) => {
                                    if let Pat::Ident(ident) = v.arg.as_ref() {
                                        current_hook.local_decl.insert(ident.id.sym.clone());
                                    }
                                }
                            }
                        }
                    }
                    Pat::Array(ref arr) => {
                        for el in &arr.elems {
                            match el {
                                Some(Pat::Ident(ref ident)) => {
                                    current_hook.local_decl.insert(ident.id.sym.clone());
                                }
                                Some(Pat::Rest(ref rest)) => {
                                    if let Pat::Ident(ref ident) = *rest.arg {
                                        current_hook.local_decl.insert(ident.id.sym.clone());
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        return node.fold_children_with(self);
    }

    fn fold_catch_clause(&mut self, node: CatchClause) -> CatchClause {
        if let Some(current_hook) = self.hook_ctx.last_mut() {
            match node.param {
                Some(Pat::Ident(ref ident)) => {
                    current_hook.local_decl.insert(ident.id.sym.clone());
                }
                Some(Pat::Object(ref obj)) => {
                    for prop in &obj.props {
                        match prop {
                            ObjectPatProp::Assign(ref v) => {
                                if let Some(Expr::Ident(ident)) = v.value.as_deref() {
                                    current_hook.local_decl.insert(ident.sym.clone());
                                } else {
                                    current_hook.local_decl.insert(v.key.sym.clone());
                                }
                            }
                            ObjectPatProp::KeyValue(ref v) => {
                                if let Pat::Ident(ident) = v.value.as_ref() {
                                    current_hook.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                            ObjectPatProp::Rest(ref v) => {
                                if let Pat::Ident(ident) = v.arg.as_ref() {
                                    current_hook.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                        }
                    }
                }
                Some(Pat::Array(ref arr)) => {
                    for el in &arr.elems {
                        match el {
                            Some(Pat::Ident(ref ident)) => {
                                current_hook.local_decl.insert(ident.id.sym.clone());
                            }
                            Some(Pat::Rest(ref rest)) => {
                                if let Pat::Ident(ref ident) = *rest.arg {
                                    current_hook.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                            _ => {}
                        }
                    }
                }
                _ => {}
            }
        }
        return node.fold_children_with(self);
    }

    fn fold_fn_decl(&mut self, node: FnDecl) -> FnDecl {
        self.stack_ctxt.push(node.ident.sym.to_string());
        if let Some(current_hook) = self.hook_ctx.last_mut() {
            current_hook.local_decl.insert(node.ident.sym.clone());
        }
        let o = node.fold_children_with(self);
        self.stack_ctxt.pop();

        return o;
    }

    fn fold_function(&mut self, node: Function) -> Function {
        if let Some(current_hook) = self.hook_ctx.last_mut() {
            for param in &node.params {
                match param.pat {
                    Pat::Ident(ref ident) => {
                        current_hook.local_decl.insert(ident.id.sym.clone());
                    }
                    Pat::Object(ref obj) => {
                        for prop in &obj.props {
                            match prop {
                                ObjectPatProp::Assign(ref v) => {
                                    if let Some(Expr::Ident(ident)) = v.value.as_deref() {
                                        current_hook.local_decl.insert(ident.sym.clone());
                                    } else {
                                        current_hook.local_decl.insert(v.key.sym.clone());
                                    }
                                }
                                ObjectPatProp::KeyValue(ref v) => {
                                    if let Pat::Ident(ident) = v.value.as_ref() {
                                        current_hook.local_decl.insert(ident.id.sym.clone());
                                    }
                                }
                                ObjectPatProp::Rest(ref v) => {
                                    if let Pat::Ident(ident) = v.arg.as_ref() {
                                        current_hook.local_decl.insert(ident.id.sym.clone());
                                    }
                                }
                            }
                        }
                    }
                    Pat::Array(ref arr) => {
                        for el in &arr.elems {
                            match el {
                                Some(Pat::Ident(ref ident)) => {
                                    current_hook.local_decl.insert(ident.id.sym.clone());
                                }
                                Some(Pat::Rest(ref rest)) => {
                                    if let Pat::Ident(ref ident) = *rest.arg {
                                        current_hook.local_decl.insert(ident.id.sym.clone());
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        return node.fold_children_with(self);
    }

    fn fold_class_decl(&mut self, node: ClassDecl) -> ClassDecl {
        self.stack_ctxt.push(node.ident.sym.to_string());
        if let Some(current_hook) = self.hook_ctx.last_mut() {
            current_hook.local_decl.insert(node.ident.sym.clone());
        }
        let o = node.fold_children_with(self);
        self.stack_ctxt.pop();

        return o;
    }

    fn fold_ident(&mut self, node: Ident) -> Ident {
        if let Some(current_hook) = self.hook_ctx.last_mut() {
            current_hook.local_idents.insert(node.sym.clone());
        }
        return node.fold_children_with(self);
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
                    let name = self.get_context_name();
                    self.hook_ctx.push(HookAnalysis::default());
                    let folded = node.fold_children_with(self);
                    let analysis = self.hook_ctx.pop().unwrap();
                    self.hooks.push(HookMeta {
                        name: name.clone(),
                        module_index: self.module_item,
                        expr: Box::new(Expr::Call(folded.clone())),
                        scope_analysis: analysis,
                    });
                    self.context.hooks_names.insert(name.clone());
                    return create_inline_qhook(&name);
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
