use lazy_static::lazy_static;
use swc_atoms::JsWord;

pub const SIGNAL: char = '$';
pub const LONG_SUFFIX: &str = "Qrl";

lazy_static! {
    pub static ref CHILDREN: JsWord = JsWord::from("children");
    pub static ref HANDLE_WATCH: JsWord = JsWord::from("handleWatch");
    pub static ref QRL: JsWord = JsWord::from("qrl");
    pub static ref INLINED_QRL: JsWord = JsWord::from("inlinedQrl");
    pub static ref QHOOK: JsWord = JsWord::from("$");
    pub static ref QWIK_INTERNAL: JsWord = JsWord::from("qwik");
    pub static ref BUILDER_IO_QWIK: JsWord = JsWord::from("@builder.io/qwik");
    pub static ref BUILDER_IO_QWIK_JSX: JsWord = JsWord::from("@builder.io/qwik/jsx-runtime");
    pub static ref QCOMPONENT: JsWord = JsWord::from("component$");
    pub static ref USE_LEXICAL_SCOPE: JsWord = JsWord::from("useLexicalScope");
    pub static ref USE_SERVER_MOUNT: JsWord = JsWord::from("useServerMount$");
    pub static ref H: JsWord = JsWord::from("h");
    pub static ref FRAGMENT: JsWord = JsWord::from("Fragment");
}
