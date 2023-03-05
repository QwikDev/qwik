use std::collections::HashMap;

use crate::collector::{new_ident_from_id, Id};
use swc_common::DUMMY_SP;
use swc_ecmascript::{
    ast,
    utils::private_ident,
    visit::{VisitMut, VisitMutWith},
};

macro_rules! id {
    ($ident: expr) => {
        ($ident.sym.clone(), $ident.span.ctxt())
    };
}

pub fn convert_inlined_fn(expr: ast::Expr, scoped_idents: Vec<Id>, qqhook: &Id) -> ast::CallExpr {
    let mut identifiers = HashMap::new();
    let params: Vec<ast::Pat> = scoped_idents
        .iter()
        .enumerate()
        .map(|(index, id)| {
            let new_ident = private_ident!(format!("p{}", index));
            identifiers.insert(id.clone(), ast::Expr::Ident(new_ident.clone()));
            ast::Pat::Ident(ast::BindingIdent {
                id: new_ident,
                type_ann: None,
            })
        })
        .collect();

    let expr = match expr {
        ast::Expr::Arrow(mut arrow) => {
            arrow
                .body
                .visit_mut_with(&mut ReplaceIdentifiers { identifiers });

            ast::Expr::Arrow(ast::ArrowExpr { params, ..arrow })
        }
        mut expr => {
            expr.visit_mut_with(&mut ReplaceIdentifiers { identifiers });

            ast::Expr::Arrow(ast::ArrowExpr {
                body: ast::BlockStmtOrExpr::Expr(Box::new(expr)),
                is_async: false,
                is_generator: false,
                params,
                return_type: None,
                span: DUMMY_SP,
                type_params: None,
            })
        }
    };

    ast::CallExpr {
        span: DUMMY_SP,
        callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(qqhook)))),
        type_args: None,
        args: vec![
            ast::ExprOrSpread::from(expr),
            ast::ExprOrSpread::from(ast::Expr::Array(ast::ArrayLit {
                span: DUMMY_SP,
                elems: scoped_idents
                    .iter()
                    .map(|id| {
                        Some(ast::ExprOrSpread::from(ast::Expr::Ident(
                            new_ident_from_id(id),
                        )))
                    })
                    .collect(),
            })),
        ],
    }
}

struct ReplaceIdentifiers {
    pub identifiers: HashMap<Id, ast::Expr>,
}

impl VisitMut for ReplaceIdentifiers {
    fn visit_mut_expr(&mut self, node: &mut ast::Expr) {
        match node {
            ast::Expr::Ident(ident) => {
                if let Some(expr) = self.identifiers.get(&id!(ident)) {
                    *node = expr.clone();
                }
            }
            _ => {
                node.visit_mut_children_with(self);
            }
        }
    }

    fn visit_mut_prop(&mut self, node: &mut ast::Prop) {
        if let ast::Prop::Shorthand(short) = node {
            if let Some(expr) = self.identifiers.get(&id!(short)) {
                *node = ast::Prop::KeyValue(ast::KeyValueProp {
                    key: ast::PropName::Ident(short.clone()),
                    value: Box::new(expr.clone()),
                });
            }
        }
        node.visit_mut_children_with(self);
    }
}
