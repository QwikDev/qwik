use std::collections::{BTreeMap, HashSet};

use swc_atoms::{js_word, JsWord};
use swc_ecmascript::ast;
use swc_ecmascript::visit::{noop_visit_type, visit_expr, visit_stmt, Visit, VisitWith};

macro_rules! id {
    ($ident: expr) => {
        $ident.sym.clone()
    };
}

#[derive(PartialEq, Clone, Copy)]
pub enum ImportKind {
    Named,
    All,
    Default,
}

pub struct Import {
    pub source: JsWord,
    pub specifier: JsWord,
    pub kind: ImportKind,
}

pub struct GlobalCollect {
    pub imports: BTreeMap<JsWord, Import>,
    pub exports: BTreeMap<JsWord, JsWord>,
    in_export_decl: bool,
}

pub fn global_collect(module: &ast::Module) -> GlobalCollect {
    let mut collect = GlobalCollect {
        imports: BTreeMap::new(),
        exports: BTreeMap::new(),
        in_export_decl: false,
    };
    module.visit_with(&mut collect);
    collect
}

impl Visit for GlobalCollect {
    noop_visit_type!();

    fn visit_import_decl(&mut self, node: &ast::ImportDecl) {
        for specifier in &node.specifiers {
            match specifier {
                ast::ImportSpecifier::Named(named) => {
                    let imported = match &named.imported {
                        Some(imported) => imported.sym.clone(),
                        None => named.local.sym.clone(),
                    };
                    self.imports.insert(
                        id!(named.local),
                        Import {
                            source: node.src.value.clone(),
                            specifier: imported,
                            kind: ImportKind::Named,
                        },
                    );
                }
                ast::ImportSpecifier::Default(default) => {
                    self.imports.insert(
                        id!(default.local),
                        Import {
                            source: node.src.value.clone(),
                            specifier: js_word!("default"),
                            kind: ImportKind::Default,
                        },
                    );
                }
                ast::ImportSpecifier::Namespace(namespace) => {
                    self.imports.insert(
                        id!(namespace.local),
                        Import {
                            source: node.src.value.clone(),
                            specifier: "*".into(),
                            kind: ImportKind::All,
                        },
                    );
                }
            }
        }
    }

    fn visit_named_export(&mut self, node: &ast::NamedExport) {
        if node.src.is_some() {
            return;
        }

        for specifier in &node.specifiers {
            match specifier {
                ast::ExportSpecifier::Named(named) => {
                    let exported = match &named.exported {
                        Some(exported) => exported.sym.clone(),
                        None => named.orig.sym.clone(),
                    };
                    self.exports.entry(id!(named.orig)).or_insert(exported);
                }
                ast::ExportSpecifier::Default(default) => {
                    self.exports
                        .entry(id!(default.exported))
                        .or_insert(js_word!("default"));
                }
                ast::ExportSpecifier::Namespace(namespace) => {
                    self.exports
                        .entry(id!(namespace.name))
                        .or_insert_with(|| "*".into());
                }
            }
        }
    }

    fn visit_export_decl(&mut self, node: &ast::ExportDecl) {
        match &node.decl {
            ast::Decl::Class(class) => {
                self.exports
                    .insert(id!(class.ident), class.ident.sym.clone());
            }
            ast::Decl::Fn(func) => {
                self.exports.insert(id!(func.ident), func.ident.sym.clone());
            }
            ast::Decl::Var(var) => {
                for decl in &var.decls {
                    self.in_export_decl = true;
                    decl.name.visit_with(self);
                    self.in_export_decl = false;

                    decl.init.visit_with(self);
                }
            }
            _ => {}
        }

        node.visit_children_with(self);
    }

    fn visit_export_default_decl(&mut self, node: &ast::ExportDefaultDecl) {
        match &node.decl {
            ast::DefaultDecl::Class(class) => {
                if let Some(ident) = &class.ident {
                    self.exports.insert(id!(ident), "default".into());
                }
            }
            ast::DefaultDecl::Fn(func) => {
                if let Some(ident) = &func.ident {
                    self.exports.insert(id!(ident), "default".into());
                }
            }
            _ => {
                unreachable!("unsupported export default declaration");
            }
        };

        node.visit_children_with(self);
    }

    fn visit_binding_ident(&mut self, node: &ast::BindingIdent) {
        if self.in_export_decl {
            self.exports.insert(id!(node.id), node.id.sym.clone());
        }
    }

    fn visit_assign_pat_prop(&mut self, node: &ast::AssignPatProp) {
        if self.in_export_decl {
            self.exports.insert(id!(node.key), node.key.sym.clone());
        }
    }
}

#[derive(Debug)]
enum ExprOrSkip {
    Expr,
    Skip,
}

#[derive(Debug)]
pub struct HookCollect {
    pub local_decl: HashSet<JsWord>,
    pub local_idents: HashSet<JsWord>,
    expr_ctxt: Vec<ExprOrSkip>,
}

impl HookCollect {
    pub fn new(node: &ast::CallExpr) -> Self {
        let mut collect = Self {
            local_decl: HashSet::new(),
            local_idents: HashSet::new(),
            expr_ctxt: vec![],
        };
        node.visit_with(&mut collect);
        collect
    }

    pub fn get_words(self) -> (Vec<JsWord>, Vec<JsWord>) {
        let mut local_decl: Vec<JsWord> = self.local_decl.into_iter().collect();
        let mut local_idents: Vec<JsWord> = self.local_idents.into_iter().collect();
        local_idents.sort();
        local_decl.sort();
        (local_decl, local_idents)
    }
}

impl Visit for HookCollect {
    fn visit_var_declarator(&mut self, node: &ast::VarDeclarator) {
        match node.name {
            ast::Pat::Ident(ref ident) => {
                self.local_decl.insert(ident.id.sym.clone());
            }
            ast::Pat::Object(ref obj) => {
                for prop in &obj.props {
                    match prop {
                        ast::ObjectPatProp::Assign(ref v) => {
                            if let Some(ast::Expr::Ident(ident)) = v.value.as_deref() {
                                self.local_decl.insert(ident.sym.clone());
                            } else {
                                self.local_decl.insert(v.key.sym.clone());
                            }
                        }
                        ast::ObjectPatProp::KeyValue(ref v) => {
                            if let ast::Pat::Ident(ident) = v.value.as_ref() {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                        }
                        ast::ObjectPatProp::Rest(ref v) => {
                            if let ast::Pat::Ident(ident) = v.arg.as_ref() {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                        }
                    }
                }
            }
            ast::Pat::Array(ref arr) => {
                for el in &arr.elems {
                    match el {
                        Some(ast::Pat::Ident(ref ident)) => {
                            self.local_decl.insert(ident.id.sym.clone());
                        }
                        Some(ast::Pat::Rest(ref rest)) => {
                            if let ast::Pat::Ident(ref ident) = *rest.arg {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        };
        node.visit_children_with(self);
    }

    fn visit_arrow_expr(&mut self, node: &ast::ArrowExpr) {
        for param in &node.params {
            match param {
                ast::Pat::Ident(ref ident) => {
                    self.local_decl.insert(ident.id.sym.clone());
                }
                ast::Pat::Object(ref obj) => {
                    for prop in &obj.props {
                        match prop {
                            ast::ObjectPatProp::Assign(ref v) => {
                                if let Some(ast::Expr::Ident(ident)) = v.value.as_deref() {
                                    self.local_decl.insert(ident.sym.clone());
                                } else {
                                    self.local_decl.insert(v.key.sym.clone());
                                }
                            }
                            ast::ObjectPatProp::KeyValue(ref v) => {
                                if let ast::Pat::Ident(ident) = v.value.as_ref() {
                                    self.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                            ast::ObjectPatProp::Rest(ref v) => {
                                if let ast::Pat::Ident(ident) = v.arg.as_ref() {
                                    self.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                        }
                    }
                }
                ast::Pat::Array(ref arr) => {
                    for el in &arr.elems {
                        match el {
                            Some(ast::Pat::Ident(ref ident)) => {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                            Some(ast::Pat::Rest(ref rest)) => {
                                if let ast::Pat::Ident(ref ident) = *rest.arg {
                                    self.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                            _ => {}
                        }
                    }
                }
                _ => {}
            }
        }
        node.visit_children_with(self);
    }

    fn visit_catch_clause(&mut self, node: &ast::CatchClause) {
        match node.param {
            Some(ast::Pat::Ident(ref ident)) => {
                self.local_decl.insert(ident.id.sym.clone());
            }
            Some(ast::Pat::Object(ref obj)) => {
                for prop in &obj.props {
                    match prop {
                        ast::ObjectPatProp::Assign(ref v) => {
                            if let Some(ast::Expr::Ident(ident)) = v.value.as_deref() {
                                self.local_decl.insert(ident.sym.clone());
                            } else {
                                self.local_decl.insert(v.key.sym.clone());
                            }
                        }
                        ast::ObjectPatProp::KeyValue(ref v) => {
                            if let ast::Pat::Ident(ident) = v.value.as_ref() {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                        }
                        ast::ObjectPatProp::Rest(ref v) => {
                            if let ast::Pat::Ident(ident) = v.arg.as_ref() {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                        }
                    }
                }
            }
            Some(ast::Pat::Array(ref arr)) => {
                for el in &arr.elems {
                    match el {
                        Some(ast::Pat::Ident(ref ident)) => {
                            self.local_decl.insert(ident.id.sym.clone());
                        }
                        Some(ast::Pat::Rest(ref rest)) => {
                            if let ast::Pat::Ident(ref ident) = *rest.arg {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
        node.visit_children_with(self);
    }

    fn visit_fn_decl(&mut self, node: &ast::FnDecl) {
        self.local_decl.insert(node.ident.sym.clone());
        node.visit_children_with(self);
    }

    fn visit_function(&mut self, node: &ast::Function) {
        for param in &node.params {
            match param.pat {
                ast::Pat::Ident(ref ident) => {
                    self.local_decl.insert(ident.id.sym.clone());
                }
                ast::Pat::Object(ref obj) => {
                    for prop in &obj.props {
                        match prop {
                            ast::ObjectPatProp::Assign(ref v) => {
                                if let Some(ast::Expr::Ident(ident)) = v.value.as_deref() {
                                    self.local_decl.insert(ident.sym.clone());
                                } else {
                                    self.local_decl.insert(v.key.sym.clone());
                                }
                            }
                            ast::ObjectPatProp::KeyValue(ref v) => {
                                if let ast::Pat::Ident(ident) = v.value.as_ref() {
                                    self.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                            ast::ObjectPatProp::Rest(ref v) => {
                                if let ast::Pat::Ident(ident) = v.arg.as_ref() {
                                    self.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                        }
                    }
                }
                ast::Pat::Array(ref arr) => {
                    for el in &arr.elems {
                        match el {
                            Some(ast::Pat::Ident(ref ident)) => {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                            Some(ast::Pat::Rest(ref rest)) => {
                                if let ast::Pat::Ident(ref ident) = *rest.arg {
                                    self.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                            _ => {}
                        }
                    }
                }
                _ => {}
            }
        }
        node.visit_children_with(self);
    }

    fn visit_class_decl(&mut self, node: &ast::ClassDecl) {
        self.local_decl.insert(node.ident.sym.clone());
        node.visit_children_with(self);
    }

    fn visit_expr(&mut self, node: &ast::Expr) {
        self.expr_ctxt.push(ExprOrSkip::Expr);
        visit_expr(self, node);
        self.expr_ctxt.pop();
    }

    fn visit_stmt(&mut self, node: &ast::Stmt) {
        self.expr_ctxt.push(ExprOrSkip::Skip);
        visit_stmt(self, node);
        self.expr_ctxt.pop();
    }

    fn visit_ident(&mut self, node: &ast::Ident) {
        if let Some(ExprOrSkip::Expr) = self.expr_ctxt.last() {
            self.local_idents.insert(node.sym.clone());
        }
    }

    fn visit_key_value_prop(&mut self, node: &ast::KeyValueProp) {
        self.expr_ctxt.push(ExprOrSkip::Skip);
        node.visit_children_with(self);
        self.expr_ctxt.pop();
    }
}
