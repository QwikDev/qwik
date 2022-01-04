use lazy_static::lazy_static;
use swc_atoms::JsWord;

lazy_static! {
    pub static ref QHOOK: JsWord = JsWord::from("qHook");
    pub static ref QWIK_INTERNAL: JsWord = JsWord::from("__qwik__");
    pub static ref BUILDER_IO_QWIK: JsWord = JsWord::from("@builder.io/qwik");
    pub static ref QCOMPONENT: JsWord = JsWord::from("qComponent");
    pub static ref QHOOK_HANDLER: JsWord = JsWord::from("qHook");
}
