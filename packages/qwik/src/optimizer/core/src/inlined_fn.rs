use crate::collector::{new_ident_from_id, Id};
use swc_common::DUMMY_SP;
use swc_ecmascript::ast;
use swc_ecmascript::

pub fn convert_inlined_fn(expr: ast::Expr, scoped_idents: Vec<Id>, qqhook: &Id) -> ast::CallExpr {
    let expr = match expr {
        ast::Expr::Arrow(arrow) => {
            let params: Vec<ast::Pat> = scoped_idents
                .iter()
                .map(|id| {
                    ast::Pat::Ident(ast::BindingIdent {
                        id: new_ident_from_id(id),
                        type_ann: None,
                    })
                })
                .collect();
            ast::Expr::Arrow(ast::ArrowExpr { params, ..arrow })
        }
        _ => expr,
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
