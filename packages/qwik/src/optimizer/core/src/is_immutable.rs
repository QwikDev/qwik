use crate::collector::GlobalCollect;
use swc_ecmascript::ast;
use swc_ecmascript::visit::{noop_visit_type, Visit};

macro_rules! id {
    ($ident: expr) => {
        ($ident.sym.clone(), $ident.span.ctxt())
    };
}

pub struct ImmutableCollector<'a> {
    global: &'a GlobalCollect,
    pub is_immutable: bool,
}

impl<'a> ImmutableCollector<'a> {
    const fn new(global: &'a GlobalCollect) -> Self {
        Self {
            global,
            is_immutable: true,
        }
    }
}

pub fn is_immutable_expr(expr: &ast::Expr, global: &GlobalCollect) -> bool {
    let mut collector = ImmutableCollector::new(global);
    collector.visit_expr(expr);
    collector.is_immutable
}

impl<'a> Visit for ImmutableCollector<'a> {
    noop_visit_type!();

    fn visit_call_expr(&mut self, node: &ast::CallExpr) {
        self.is_immutable = false;
    }

    fn visit_arrow_expr(&mut self, _: &ast::ArrowExpr) {}

    fn visit_ident(&mut self, ident: &ast::Ident) {
        let id = id!(ident);
        if self.global.imports.contains_key(&id) {
            return;
        }
        if self.global.exports.contains_key(&id) {
            return;
        }
        self.is_immutable = false;
    }
}
