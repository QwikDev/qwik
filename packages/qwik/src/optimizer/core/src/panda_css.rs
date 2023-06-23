use boa_engine::Context;
use swc_atoms::JsWord;
use swc_common::Spanned;
use swc_ecmascript::ast;
use swc_ecmascript::visit::{VisitMut, VisitMutWith};

use crate::collector::{GlobalCollect, Id};
use crate::inlined_fn::render_expr;

macro_rules! id_eq {
    ($ident: expr, $cid: expr) => {
        if let Some(cid) = $cid {
            cid.0 == $ident.sym && cid.1 == $ident.span.ctxt()
        } else {
            false
        }
    };
}

pub struct PandaCSSTransform {
    css_ident: Option<Id>,
    js_context: Context,
}

impl PandaCSSTransform {
    pub fn new(global_collector: &GlobalCollect) -> Self {
        let mut js_context = Context::default();
        js_context.eval(&include_str!("panda.js")).unwrap();
        let css_ident = global_collector
            .get_imported_local(&JsWord::from("css"), &JsWord::from("~/styled-system/css"));
        Self {
            css_ident,
            js_context,
        }
    }
}

impl VisitMut for PandaCSSTransform {
    fn visit_mut_expr(&mut self, node: &mut ast::Expr) {
        if let ast::Expr::Call(ast::CallExpr {
            callee: ast::Callee::Expr(box ast::Expr::Ident(ident)),
            ..
        }) = &node
        {
            if id_eq!(ident, &self.css_ident) {
                let result = self.js_context.eval(&render_expr(node)).unwrap();
                *node = ast::Expr::Lit(
                    ast::Lit::Str(ast::Str {
                        span: node.span(),
                        value: JsWord::from(result.as_string().unwrap().as_str()),
                        raw: None,
                    })
                    .into(),
                );
                return;
            }
        }
        node.visit_mut_children_with(self);
    }
}
