use std::collections::{BTreeMap, HashSet};
use swc_atoms::{js_word, JsWord};
use swc_common::DUMMY_SP;
use swc_ecmascript::ast::*;
use swc_ecmascript::visit::{noop_visit_type, Node, Visit, VisitWith};

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

pub fn global_collect(module: &Module) -> GlobalCollect {
    let mut collect = GlobalCollect {
        imports: BTreeMap::new(),
        exports: BTreeMap::new(),
        in_export_decl: false,
    };
    module.visit_with(&Invalid { span: DUMMY_SP } as _, &mut collect);
    collect
}

impl Visit for GlobalCollect {
    noop_visit_type!();

    fn visit_import_decl(&mut self, node: &ImportDecl, _parent: &dyn Node) {
        for specifier in &node.specifiers {
            match specifier {
                ImportSpecifier::Named(named) => {
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
                ImportSpecifier::Default(default) => {
                    self.imports.insert(
                        id!(default.local),
                        Import {
                            source: node.src.value.clone(),
                            specifier: js_word!("default"),
                            kind: ImportKind::Default,
                        },
                    );
                }
                ImportSpecifier::Namespace(namespace) => {
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

    fn visit_named_export(&mut self, node: &NamedExport, _parent: &dyn Node) {
        if node.src.is_some() {
            return;
        }

        for specifier in &node.specifiers {
            match specifier {
                ExportSpecifier::Named(named) => {
                    let exported = match &named.exported {
                        Some(exported) => exported.sym.clone(),
                        None => named.orig.sym.clone(),
                    };
                    self.exports.entry(id!(named.orig)).or_insert(exported);
                }
                ExportSpecifier::Default(default) => {
                    self.exports
                        .entry(id!(default.exported))
                        .or_insert(js_word!("default"));
                }
                ExportSpecifier::Namespace(namespace) => {
                    self.exports
                        .entry(id!(namespace.name))
                        .or_insert_with(|| "*".into());
                }
            }
        }
    }

    fn visit_export_decl(&mut self, node: &ExportDecl, _parent: &dyn Node) {
        match &node.decl {
            Decl::Class(class) => {
                self.exports
                    .insert(id!(class.ident), class.ident.sym.clone());
            }
            Decl::Fn(func) => {
                self.exports.insert(id!(func.ident), func.ident.sym.clone());
            }
            Decl::Var(var) => {
                for decl in &var.decls {
                    self.in_export_decl = true;
                    decl.name.visit_with(decl, self);
                    self.in_export_decl = false;

                    decl.init.visit_with(decl, self);
                }
            }
            _ => {}
        }

        node.visit_children_with(self);
    }

    fn visit_export_default_decl(&mut self, node: &ExportDefaultDecl, _parent: &dyn Node) {
        match &node.decl {
            DefaultDecl::Class(class) => {
                if let Some(ident) = &class.ident {
                    self.exports.insert(id!(ident), "default".into());
                }
            }
            DefaultDecl::Fn(func) => {
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

    fn visit_binding_ident(&mut self, node: &BindingIdent, _parent: &dyn Node) {
        if self.in_export_decl {
            self.exports.insert(id!(node.id), node.id.sym.clone());
        }
    }

    fn visit_assign_pat_prop(&mut self, node: &AssignPatProp, _parent: &dyn Node) {
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
    pub fn new(node: &CallExpr) -> Self {
        let mut collect = Self {
            local_decl: HashSet::new(),
            local_idents: HashSet::new(),
            expr_ctxt: vec![],
        };
        node.visit_with(&Invalid { span: DUMMY_SP } as _, &mut collect);
        collect
    }

    pub fn get_local_decl(&self) -> Vec<JsWord> {
        let mut items: Vec<JsWord> = self.local_decl.iter().cloned().collect();
        items.sort();
        items
    }

    pub fn get_local_idents(&self) -> Vec<JsWord> {
        let mut items: Vec<JsWord> = self.local_idents.iter().cloned().collect();
        items.sort();
        items
    }
}

impl Visit for HookCollect {
    fn visit_var_declarator(&mut self, node: &VarDeclarator, _parent: &dyn Node) {
        match node.name {
            Pat::Ident(ref ident) => {
                self.local_decl.insert(ident.id.sym.clone());
            }
            Pat::Object(ref obj) => {
                for prop in &obj.props {
                    match prop {
                        ObjectPatProp::Assign(ref v) => {
                            if let Some(Expr::Ident(ident)) = v.value.as_deref() {
                                self.local_decl.insert(ident.sym.clone());
                            } else {
                                self.local_decl.insert(v.key.sym.clone());
                            }
                        }
                        ObjectPatProp::KeyValue(ref v) => {
                            if let Pat::Ident(ident) = v.value.as_ref() {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                        }
                        ObjectPatProp::Rest(ref v) => {
                            if let Pat::Ident(ident) = v.arg.as_ref() {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                        }
                    }
                }
            }
            Pat::Array(ref arr) => {
                for el in &arr.elems {
                    match el {
                        Some(Pat::Ident(ref ident)) => {
                            self.local_decl.insert(ident.id.sym.clone());
                        }
                        Some(Pat::Rest(ref rest)) => {
                            if let Pat::Ident(ref ident) = *rest.arg {
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

    fn visit_arrow_expr(&mut self, node: &ArrowExpr, _parent: &dyn Node) {
        for param in &node.params {
            match param {
                Pat::Ident(ref ident) => {
                    self.local_decl.insert(ident.id.sym.clone());
                }
                Pat::Object(ref obj) => {
                    for prop in &obj.props {
                        match prop {
                            ObjectPatProp::Assign(ref v) => {
                                if let Some(Expr::Ident(ident)) = v.value.as_deref() {
                                    self.local_decl.insert(ident.sym.clone());
                                } else {
                                    self.local_decl.insert(v.key.sym.clone());
                                }
                            }
                            ObjectPatProp::KeyValue(ref v) => {
                                if let Pat::Ident(ident) = v.value.as_ref() {
                                    self.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                            ObjectPatProp::Rest(ref v) => {
                                if let Pat::Ident(ident) = v.arg.as_ref() {
                                    self.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                        }
                    }
                }
                Pat::Array(ref arr) => {
                    for el in &arr.elems {
                        match el {
                            Some(Pat::Ident(ref ident)) => {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                            Some(Pat::Rest(ref rest)) => {
                                if let Pat::Ident(ref ident) = *rest.arg {
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

    fn visit_catch_clause(&mut self, node: &CatchClause, _parent: &dyn Node) {
        match node.param {
            Some(Pat::Ident(ref ident)) => {
                self.local_decl.insert(ident.id.sym.clone());
            }
            Some(Pat::Object(ref obj)) => {
                for prop in &obj.props {
                    match prop {
                        ObjectPatProp::Assign(ref v) => {
                            if let Some(Expr::Ident(ident)) = v.value.as_deref() {
                                self.local_decl.insert(ident.sym.clone());
                            } else {
                                self.local_decl.insert(v.key.sym.clone());
                            }
                        }
                        ObjectPatProp::KeyValue(ref v) => {
                            if let Pat::Ident(ident) = v.value.as_ref() {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                        }
                        ObjectPatProp::Rest(ref v) => {
                            if let Pat::Ident(ident) = v.arg.as_ref() {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                        }
                    }
                }
            }
            Some(Pat::Array(ref arr)) => {
                for el in &arr.elems {
                    match el {
                        Some(Pat::Ident(ref ident)) => {
                            self.local_decl.insert(ident.id.sym.clone());
                        }
                        Some(Pat::Rest(ref rest)) => {
                            if let Pat::Ident(ref ident) = *rest.arg {
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

    fn visit_fn_decl(&mut self, node: &FnDecl, _parent: &dyn Node) {
        self.local_decl.insert(node.ident.sym.clone());
        node.visit_children_with(self);
    }

    fn visit_function(&mut self, node: &Function, _parent: &dyn Node) {
        for param in &node.params {
            match param.pat {
                Pat::Ident(ref ident) => {
                    self.local_decl.insert(ident.id.sym.clone());
                }
                Pat::Object(ref obj) => {
                    for prop in &obj.props {
                        match prop {
                            ObjectPatProp::Assign(ref v) => {
                                if let Some(Expr::Ident(ident)) = v.value.as_deref() {
                                    self.local_decl.insert(ident.sym.clone());
                                } else {
                                    self.local_decl.insert(v.key.sym.clone());
                                }
                            }
                            ObjectPatProp::KeyValue(ref v) => {
                                if let Pat::Ident(ident) = v.value.as_ref() {
                                    self.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                            ObjectPatProp::Rest(ref v) => {
                                if let Pat::Ident(ident) = v.arg.as_ref() {
                                    self.local_decl.insert(ident.id.sym.clone());
                                }
                            }
                        }
                    }
                }
                Pat::Array(ref arr) => {
                    for el in &arr.elems {
                        match el {
                            Some(Pat::Ident(ref ident)) => {
                                self.local_decl.insert(ident.id.sym.clone());
                            }
                            Some(Pat::Rest(ref rest)) => {
                                if let Pat::Ident(ref ident) = *rest.arg {
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

    fn visit_class_decl(&mut self, node: &ClassDecl, _parent: &dyn Node) {
        self.local_decl.insert(node.ident.sym.clone());
        node.visit_children_with(self);
    }

    fn visit_expr(&mut self, node: &Expr, parent: &dyn Node) {
        self.expr_ctxt.push(ExprOrSkip::Expr);
        swc_ecmascript::visit::visit_expr(self, node, parent);
        self.expr_ctxt.pop();
    }

    fn visit_stmt(&mut self, node: &Stmt, parent: &dyn Node) {
        self.expr_ctxt.push(ExprOrSkip::Skip);
        swc_ecmascript::visit::visit_stmt(self, node, parent);
        self.expr_ctxt.pop();
    }

    fn visit_ident(&mut self, node: &Ident, _parent: &dyn Node) {
        if let Some(ExprOrSkip::Expr) = self.expr_ctxt.last() {
            self.local_idents.insert(node.sym.clone());
        }
    }

    fn visit_key_value_prop(&mut self, node: &KeyValueProp, _parent: &dyn Node) {
        self.expr_ctxt.push(ExprOrSkip::Skip);
        node.visit_children_with(self);
        self.expr_ctxt.pop();
    }
}
