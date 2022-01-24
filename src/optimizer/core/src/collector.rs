use std::collections::{BTreeMap, HashMap, HashSet};

use swc_atoms::{js_word, JsWord};
use swc_common::{BytePos, Span, SyntaxContext};
use swc_ecmascript::ast;
use swc_ecmascript::visit::{noop_visit_type, visit_expr, visit_stmt, Visit, VisitWith};

macro_rules! id {
    ($ident: expr) => {
        ($ident.sym.clone(), $ident.span.ctxt())
    };
}

pub type Id = (JsWord, SyntaxContext);

pub fn new_ident_from_id(id: &Id) -> ast::Ident {
    ast::Ident::new(
        id.0.clone(),
        Span {
            lo: BytePos(0),
            hi: BytePos(0),
            ctxt: id.1,
        },
    )
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
    pub imports: BTreeMap<Id, Import>,
    pub exports: BTreeMap<Id, Option<JsWord>>,
    pub root: HashMap<Id, Span>,
    in_export_decl: bool,
}

pub fn global_collect(module: &ast::Module) -> GlobalCollect {
    let mut collect = GlobalCollect {
        imports: BTreeMap::new(),
        exports: BTreeMap::new(),
        root: HashMap::new(),
        in_export_decl: false,
    };
    module.visit_with(&mut collect);
    collect
}

impl GlobalCollect {
    pub fn get_imported_local(&self, specifier: &JsWord, source: &JsWord) -> Option<Id> {
        self.imports
            .iter()
            .find(|(_, import)| &import.specifier == specifier && &import.source == source)
            .map(|s| s.0.clone())
    }
}

impl Visit for GlobalCollect {
    noop_visit_type!();

    fn visit_module_item(&mut self, node: &ast::ModuleItem) {
        if let ast::ModuleItem::Stmt(ast::Stmt::Decl(decl)) = node {
            match decl {
                ast::Decl::Fn(function) => {
                    self.root.insert(id!(function.ident), function.ident.span);
                }
                ast::Decl::Class(class) => {
                    self.root.insert(id!(class.ident), class.ident.span);
                }
                ast::Decl::Var(var) => {
                    for decl in &var.decls {
                        collect_from_pat(&decl.name, &mut self.root);
                    }
                }
                _ => {}
            }
        } else {
            node.visit_children_with(self);
        }
    }

    fn visit_import_decl(&mut self, node: &ast::ImportDecl) {
        for specifier in &node.specifiers {
            match specifier {
                ast::ImportSpecifier::Named(named) => {
                    let imported = match &named.imported {
                        Some(ast::ModuleExportName::Ident(ident)) => ident.sym.clone(),
                        _ => named.local.sym.clone(),
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
                    let local = match &named.orig {
                        ast::ModuleExportName::Ident(ident) => Some(id!(ident)),
                        _ => None,
                    };
                    let exported = match &named.exported {
                        Some(ast::ModuleExportName::Ident(exported)) => Some(exported.sym.clone()),
                        _ => None,
                    };
                    if let Some(local) = local {
                        self.exports.entry(local).or_insert(exported);
                    }
                }
                ast::ExportSpecifier::Default(default) => {
                    self.exports
                        .entry(id!(default.exported))
                        .or_insert(Some(js_word!("default")));
                }
                ast::ExportSpecifier::Namespace(namespace) => {
                    if let ast::ModuleExportName::Ident(ident) = &namespace.name {
                        self.exports
                            .entry(id!(ident))
                            .or_insert_with(|| Some("*".into()));
                    }
                }
            }
        }
    }

    fn visit_export_decl(&mut self, node: &ast::ExportDecl) {
        match &node.decl {
            ast::Decl::Class(class) => {
                self.exports.insert(id!(class.ident), None);
            }
            ast::Decl::Fn(func) => {
                self.exports.insert(id!(func.ident), None);
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
    }

    fn visit_export_default_decl(&mut self, node: &ast::ExportDefaultDecl) {
        match &node.decl {
            ast::DefaultDecl::Class(class) => {
                if let Some(ident) = &class.ident {
                    self.exports.insert(id!(ident), Some(js_word!("default")));
                }
            }
            ast::DefaultDecl::Fn(func) => {
                if let Some(ident) = &func.ident {
                    self.exports.insert(id!(ident), Some(js_word!("default")));
                }
            }
            _ => {
                unreachable!("unsupported export default declaration");
            }
        };
    }

    fn visit_binding_ident(&mut self, node: &ast::BindingIdent) {
        if self.in_export_decl {
            self.exports.insert(id!(node.id), None);
        }
    }

    fn visit_assign_pat_prop(&mut self, node: &ast::AssignPatProp) {
        if self.in_export_decl {
            self.exports.insert(id!(node.key), None);
        }
    }
}

#[derive(Debug)]
enum ExprOrSkip {
    Expr,
    Skip,
}

#[derive(Debug)]
pub struct IdentCollector {
    pub local_idents: HashSet<Id>,
    pub use_h: bool,
    pub use_fragment: bool,

    expr_ctxt: Vec<ExprOrSkip>,
}

impl IdentCollector {
    pub fn new() -> Self {
        Self {
            local_idents: HashSet::new(),
            expr_ctxt: vec![],
            use_h: false,
            use_fragment: false,
        }
    }

    pub fn get_words(self) -> Vec<Id> {
        let mut local_idents: Vec<Id> = self.local_idents.into_iter().collect();
        local_idents.sort();
        local_idents
    }
}

impl Visit for IdentCollector {
    noop_visit_type!();

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

    fn visit_jsx_element(&mut self, node: &ast::JSXElement) {
        self.use_h = true;
        node.visit_children_with(self);
    }

    fn visit_jsx_fragment(&mut self, node: &ast::JSXFragment) {
        self.use_h = true;
        self.use_fragment = true;
        node.visit_children_with(self);
    }

    fn visit_jsx_element_name(&mut self, node: &ast::JSXElementName) {
        if let ast::JSXElementName::Ident(ref ident) = node {
            let ident_name = ident.sym.as_ref().chars().next();
            if let Some('A'..='Z') = ident_name {
            } else {
                return;
            }
        }

        node.visit_children_with(self);
    }
    fn visit_jsx_attr(&mut self, node: &ast::JSXAttr) {
        self.expr_ctxt.push(ExprOrSkip::Skip);
        node.visit_children_with(self);
        self.expr_ctxt.pop();
    }

    fn visit_ident(&mut self, node: &ast::Ident) {
        if let Some(ExprOrSkip::Expr) = self.expr_ctxt.last() {
            if node.span.ctxt() != SyntaxContext::empty() {
                self.local_idents.insert(id!(node));
            }
        }
    }

    fn visit_key_value_prop(&mut self, node: &ast::KeyValueProp) {
        self.expr_ctxt.push(ExprOrSkip::Skip);
        node.visit_children_with(self);
        self.expr_ctxt.pop();
    }
}

pub fn collect_from_pat(pat: &ast::Pat, identifiers: &mut HashMap<Id, Span>) {
    match pat {
        ast::Pat::Ident(ident) => {
            identifiers.insert(id!(ident.id), ident.id.span);
        }
        ast::Pat::Array(array) => {
            for el in array.elems.iter().flatten() {
                collect_from_pat(el, identifiers);
            }
        }
        ast::Pat::Rest(rest) => {
            if let ast::Pat::Ident(ident) = rest.arg.as_ref() {
                identifiers.insert(id!(ident.id), ident.id.span);
            }
        }
        ast::Pat::Assign(expr) => {
            if let ast::Pat::Ident(ident) = expr.left.as_ref() {
                identifiers.insert(id!(ident.id), ident.id.span);
            }
        }
        ast::Pat::Object(obj) => {
            for prop in &obj.props {
                match prop {
                    ast::ObjectPatProp::Assign(ref v) => {
                        identifiers.insert(id!(v.key), v.key.span);
                    }
                    ast::ObjectPatProp::KeyValue(ref v) => {
                        collect_from_pat(&v.value, identifiers);
                    }
                    ast::ObjectPatProp::Rest(ref v) => {
                        if let ast::Pat::Ident(ident) = v.arg.as_ref() {
                            identifiers.insert(id!(ident.id), ident.id.span);
                        }
                    }
                }
            }
        }
        _ => {}
    };
}
