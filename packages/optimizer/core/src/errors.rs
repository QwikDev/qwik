pub enum DiagnosticRule {
	FunctionReference,
	CanNotCapture,
	MissingQrlImplementation,
	PreventdefaultPassiveCheck,
}

pub fn get_diagnostic_code(rule: DiagnosticRule) -> &'static str {
	match rule {
		DiagnosticRule::FunctionReference => "C02",
		DiagnosticRule::CanNotCapture => "C03",
		DiagnosticRule::MissingQrlImplementation => "C05",
		DiagnosticRule::PreventdefaultPassiveCheck => "preventdefault-passive-check",
	}
}
