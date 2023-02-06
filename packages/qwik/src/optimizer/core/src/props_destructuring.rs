use std::collections::HashMap;

use crate::code_move::create_return_stmt;
use crate::collector::{new_ident_from_id, GlobalCollect, Id};
use crate::is_immutable::is_immutable_expr;
use crate::words::*;
use swc_atoms::JsWord;
use swc_common::DUMMY_SP;
use swc_ecmascript::ast;
use swc_ecmascript::utils::private_ident;
use swc_ecmascript::visit::{VisitMut, VisitMutWith};

struct PropsDestructuing<'a> {
    component_ident: Option<Id>,
    pub identifiers: HashMap<Id, ast::Expr>,
    pub global_collect: &'a mut GlobalCollect,
}

pub fn transform_props_destructuring(
    main_module: &mut ast::Module,
    global_collect: &mut GlobalCollect,
) {
    main_module.visit_mut_with(&mut PropsDestructuing {
        component_ident: global_collect.get_imported_local(&COMPONENT, &BUILDER_IO_QWIK),
        identifiers: HashMap::new(),
        global_collect,
    });
}

macro_rules! id {
    ($ident: expr) => {
        ($ident.sym.clone(), $ident.span.ctxt())
    };
}

macro_rules! id_eq {
    ($ident: expr, $cid: expr) => {
        if let Some(cid) = $cid {
            cid.0 == $ident.sym && cid.1 == $ident.span.ctxt()
        } else {
            false
        }
    };
}

impl<'a> VisitMut for PropsDestructuing<'a> {
    fn visit_mut_call_expr(&mut self, node: &mut ast::CallExpr) {
        if let ast::Callee::Expr(box ast::Expr::Ident(ref ident)) = &node.callee {
            if id_eq!(ident, &self.component_ident) {
                if let Some(first_arg) = node.args.first_mut() {
                    if let ast::Expr::Arrow(arrow) = &mut *first_arg.expr {
                        transform_component_props(arrow, self);
                    }
                }
            }
        }
        node.visit_mut_children_with(self);
    }

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

fn transform_component_props(arrow: &mut ast::ArrowExpr, props_transform: &mut PropsDestructuing) {
    if let Some(ast::Pat::Object(obj)) = arrow.params.first() {
        let new_ident = private_ident!("props");
        let mut local = vec![];
        let mut skip = false;
        let mut rest_id = None;
        for prop in &obj.props {
            match prop {
                ast::ObjectPatProp::Assign(ref v) => {
                    let access = ast::Expr::Member(ast::MemberExpr {
                        obj: Box::new(ast::Expr::Ident(new_ident.clone())),
                        prop: ast::MemberProp::Ident(v.key.clone()),
                        span: DUMMY_SP,
                    });
                    if let Some(value) = &v.value {
                        if is_immutable_expr(
                            value.as_ref(),
                            &COMPONENT,
                            props_transform.global_collect,
                            None,
                        ) {
                            local.push((
                                id!(v.key),
                                v.key.sym.clone(),
                                ast::Expr::Bin(ast::BinExpr {
                                    span: DUMMY_SP,
                                    op: ast::BinaryOp::NullishCoalescing,
                                    left: Box::new(access),
                                    right: value.clone(),
                                }),
                            ));
                        } else {
                            skip = true;
                        }
                    } else {
                        local.push((id!(v.key), v.key.sym.clone(), access));
                    }
                }
                ast::ObjectPatProp::KeyValue(ref v) => {
                    if let ast::PropName::Ident(ref key) = v.key {
                        if let ast::Pat::Ident(ref ident) = *v.value {
                            let access = ast::Expr::Member(ast::MemberExpr {
                                obj: Box::new(ast::Expr::Ident(new_ident.clone())),
                                prop: ast::MemberProp::Ident(key.clone()),
                                span: DUMMY_SP,
                            });
                            local.push((id!(ident), key.sym.clone(), access));
                        } else {
                            skip = true;
                        }
                    } else {
                        skip = true;
                    }
                }
                ast::ObjectPatProp::Rest(ast::RestPat { box arg, .. }) => {
                    if let ast::Pat::Ident(ref ident) = arg {
                        rest_id = Some(id!(&ident.id));
                    } else {
                        skip = true;
                    }
                }
            }
        }
        if skip || local.is_empty() {
            return;
        }
        if let Some(rest_id) = rest_id {
            let props_id = id!(new_ident);
            let omit_fn = props_transform
                .global_collect
                .import(_REST_PROPS.clone(), BUILDER_IO_QWIK.clone());
            let omit = local.iter().map(|(_, id, _)| id.clone()).collect();
            transform_rest(arrow, &omit_fn, &rest_id, &props_id, omit);
        }
        for (id, _, expr) in local {
            props_transform.identifiers.insert(id, expr);
        }
        arrow.params[0] = ast::Pat::Ident(ast::BindingIdent::from(new_ident));
    }
}

fn transform_rest(
    arrow: &mut ast::ArrowExpr,
    omit_fn: &Id,
    rest_id: &Id,
    props_id: &Id,
    omit: Vec<JsWord>,
) {
    let new_stmt = create_omit_props(omit_fn, rest_id, props_id, omit);
    match &mut arrow.body {
        ast::BlockStmtOrExpr::BlockStmt(block) => {
            block.stmts.insert(0, new_stmt);
        }
        ast::BlockStmtOrExpr::Expr(ref expr) => {
            arrow.body = ast::BlockStmtOrExpr::BlockStmt(ast::BlockStmt {
                span: DUMMY_SP,
                stmts: vec![new_stmt, create_return_stmt(expr.clone())],
            });
        }
    }
}

fn create_omit_props(omit_fn: &Id, rest_id: &Id, props_id: &Id, omit: Vec<JsWord>) -> ast::Stmt {
    ast::Stmt::Decl(ast::Decl::Var(Box::new(ast::VarDecl {
        span: DUMMY_SP,
        declare: false,
        kind: ast::VarDeclKind::Const,
        decls: vec![ast::VarDeclarator {
            definite: false,
            span: DUMMY_SP,
            init: Some(Box::new(ast::Expr::Call(ast::CallExpr {
                callee: ast::Callee::Expr(Box::new(ast::Expr::Ident(new_ident_from_id(omit_fn)))),
                span: DUMMY_SP,
                type_args: None,
                args: vec![
                    ast::ExprOrSpread {
                        spread: None,
                        expr: Box::new(ast::Expr::Ident(new_ident_from_id(props_id))),
                    },
                    ast::ExprOrSpread {
                        spread: None,
                        expr: Box::new(ast::Expr::Array(ast::ArrayLit {
                            span: DUMMY_SP,
                            elems: omit
                                .into_iter()
                                .map(|v| {
                                    Some(ast::ExprOrSpread {
                                        spread: None,
                                        expr: Box::new(ast::Expr::Lit(ast::Lit::Str(ast::Str {
                                            span: DUMMY_SP,
                                            value: v,
                                            raw: None,
                                        }))),
                                    })
                                })
                                .collect(),
                        })),
                    },
                ],
            }))),
            name: ast::Pat::Ident(ast::BindingIdent::from(new_ident_from_id(rest_id))),
        }],
    })))
}
