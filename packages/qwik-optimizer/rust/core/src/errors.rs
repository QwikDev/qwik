use swc_common::errors::DiagnosticId;

pub enum Error {
	FunctionReference = 2,
	CanNotCapture,
	MissingQrlImplementation = 5,
}

pub fn get_diagnostic_id(err: Error) -> DiagnosticId {
	let id = err as u32;
	DiagnosticId::Error(format!("C{:02}", id))
}
