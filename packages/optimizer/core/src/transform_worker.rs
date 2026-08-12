use crate::collector::GlobalCollect;
use crate::words::QWORKER;
use swc_atoms::Atom;
use swc_ecmascript::ast;
use swc_ecmascript::utils::private_ident;

pub(super) fn worker_qrl_call<'a>(
	global_collect: &GlobalCollect,
	expr: &'a ast::Expr,
) -> Option<&'a ast::CallExpr> {
	let ast::Expr::Call(call) = expr else {
		return None;
	};
	let ast::Callee::Expr(box ast::Expr::Ident(ident)) = &call.callee else {
		return None;
	};
	let import = global_collect
		.imports
		.get(&(ident.sym.clone(), ident.ctxt))?;
	if import.specifier == *QWORKER {
		Some(call)
	} else {
		None
	}
}

pub(super) fn worker_qrl_event_handler<'a>(
	global_collect: &GlobalCollect,
	expr: &'a ast::Expr,
) -> Option<&'a ast::Expr> {
	let call = worker_qrl_call(global_collect, expr)?;
	let first_arg = call.args.first()?;
	if matches!(*first_arg.expr, ast::Expr::Arrow(_) | ast::Expr::Fn(_)) {
		Some(first_arg.expr.as_ref())
	} else {
		None
	}
}

pub(super) fn create_worker_qrl_event_wrapper(
	call: &ast::CallExpr,
	params_to_lift: &[ast::Ident],
) -> ast::Expr {
	let event = private_ident!(Atom::from("event"));
	let element = private_ident!(Atom::from("element"));
	let mut worker_call = call.clone();
	if let Some(first_arg) = worker_call.args.first_mut() {
		if !params_to_lift.is_empty() {
			first_arg.expr = Box::new(super::transform_event_handler_with_iter_var(
				*first_arg.expr.clone(),
				params_to_lift,
			));
		}
	}
	let mut params = vec![
		ast::Pat::Ident(ast::BindingIdent {
			id: event.clone(),
			type_ann: None,
		}),
		ast::Pat::Ident(ast::BindingIdent {
			id: element.clone(),
			type_ann: None,
		}),
	];
	params.extend(params_to_lift.iter().map(|ident| {
		ast::Pat::Ident(ast::BindingIdent {
			id: ident.clone(),
			type_ann: None,
		})
	}));
	let mut args = vec![
		ast::ExprOrSpread {
			spread: None,
			expr: Box::new(ast::Expr::Ident(event)),
		},
		ast::ExprOrSpread {
			spread: None,
			expr: Box::new(ast::Expr::Ident(element)),
		},
	];
	args.extend(params_to_lift.iter().map(|ident| ast::ExprOrSpread {
		spread: None,
		expr: Box::new(ast::Expr::Ident(ident.clone())),
	}));

	ast::Expr::Arrow(ast::ArrowExpr {
		span: call.span,
		params,
		body: Box::new(ast::BlockStmtOrExpr::Expr(Box::new(ast::Expr::Call(
			ast::CallExpr {
				span: call.span,
				callee: ast::Callee::Expr(Box::new(ast::Expr::Call(worker_call))),
				args,
				..Default::default()
			},
		)))),
		..Default::default()
	})
}
