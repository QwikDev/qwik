use swc_ecmascript::ast;
use swc_ecmascript::visit::VisitMut;
pub struct CleanSideEffects {
    pub did_drop: bool,
}

impl CleanSideEffects {
    pub const fn new() -> Self {
        CleanSideEffects { did_drop: false }
    }
}

impl VisitMut for CleanSideEffects {
    fn visit_mut_module(&mut self, node: &mut ast::Module) {
        node.body.drain_filter(|item| match item {
            ast::ModuleItem::Stmt(ast::Stmt::Expr(expr)) => match *expr.expr {
                ast::Expr::Call(_) | ast::Expr::New(_) => {
                    self.did_drop = true;
                    true
                }
                _ => false,
            },
            _ => false,
        });
    }
}
