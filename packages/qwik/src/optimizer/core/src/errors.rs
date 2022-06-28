use swc_common::errors::DiagnosticId;

pub enum Error {
    RootLevelReference = 1,
    FunctionReference,
    CanNotCapture,
    DynamicImportInsideQhook,
    MissingQrlImplementation,
}

pub fn get_diagnostic_id(err: Error) -> DiagnosticId {
    let id = err as u32;
    DiagnosticId::Error(format!("C{:02}", id))
}
