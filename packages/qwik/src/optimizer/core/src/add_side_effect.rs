use std::collections::HashSet;

use crate::collector::GlobalCollect;
use swc_atoms::JsWord;
use swc_common::DUMMY_SP;
use swc_ecmascript::ast;
use swc_ecmascript::visit::{VisitMut, VisitMutWith};

pub struct SideEffectVisitor<'a> {
    global_collector: &'a GlobalCollect,
    imports: HashSet<JsWord>,
}

impl<'a> SideEffectVisitor<'a> {
    pub fn new(global_collector: &'a GlobalCollect) -> Self {
        Self {
            global_collector,
            imports: HashSet::new(),
        }
    }
}

impl<'a> VisitMut for SideEffectVisitor<'a> {
    fn visit_mut_import_decl(&mut self, node: &mut ast::ImportDecl) {
        if node.src.value.starts_with('.') {
            self.imports.insert(node.src.value.clone());
        }
    }
    fn visit_mut_module(&mut self, node: &mut ast::Module) {
        node.visit_mut_children_with(self);
        for import in self.global_collector.imports.values() {
            if import.source.starts_with('.') && !self.imports.contains(&import.source) {
                node.body.insert(
                    0,
                    ast::ModuleItem::ModuleDecl(ast::ModuleDecl::Import(ast::ImportDecl {
                        asserts: None,
                        span: DUMMY_SP,
                        specifiers: vec![],
                        type_only: false,
                        src: Box::new(ast::Str::from(import.source.clone())),
                    })),
                );
            }
        }
    }
}
