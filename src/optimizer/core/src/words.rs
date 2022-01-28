use lazy_static::lazy_static;
use swc_atoms::JsWord;

lazy_static! {
    pub static ref QRL: JsWord = JsWord::from("qrl");
    pub static ref QHOOK: JsWord = JsWord::from("$");
    pub static ref ON_RENDER: JsWord = JsWord::from("onRender");
    pub static ref ON_RESUME: JsWord = JsWord::from("onResume");
    pub static ref ON_HALT: JsWord = JsWord::from("onHalt");
    pub static ref QWIK_INTERNAL: JsWord = JsWord::from("qwik");
    pub static ref BUILDER_IO_QWIK: JsWord = JsWord::from("@builder.io/qwik");
    pub static ref QCOMPONENT: JsWord = JsWord::from("qComponent$");
    pub static ref USE_CLOSURE: JsWord = JsWord::from("useLexicalScope");
    pub static ref WITH_STYLE: JsWord = JsWord::from("withStyle");
    pub static ref H: JsWord = JsWord::from("h");
    pub static ref FRAGMENT: JsWord = JsWord::from("Fragment");
}
