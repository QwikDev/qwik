use lazy_static::lazy_static;
use swc_atoms::Atom;

pub const QRL_SUFFIX: char = '$';
pub const LONG_SUFFIX: &str = "Qrl";

lazy_static! {
	pub static ref REF: Atom = Atom::from("ref");
	pub static ref QSLOT: Atom = Atom::from("q:slot");
	pub static ref CHILDREN: Atom = Atom::from("children");
	pub static ref _QRL: Atom = Atom::from("qrl");
	pub static ref _QRL_DEV: Atom = Atom::from("qrlDEV");
	pub static ref _INLINED_QRL: Atom = Atom::from("inlinedQrl");
	pub static ref _INLINED_QRL_DEV: Atom = Atom::from("inlinedQrlDEV");
	pub static ref _NOOP_QRL: Atom = Atom::from("_noopQrl");
	pub static ref _NOOP_QRL_DEV: Atom = Atom::from("_noopQrlDEV");
	pub static ref _REST_PROPS: Atom = Atom::from("_restProps");
	pub static ref QSEGMENT: Atom = Atom::from("$");
	pub static ref Q_SYNC: Atom = Atom::from("sync$");
	pub static ref QWIK_INTERNAL: Atom = Atom::from("qwik");
	pub static ref BUILDER_IO_QWIK: Atom = Atom::from("@qwik.dev/core");
	pub static ref BUILDER_IO_QWIK_BUILD: Atom = Atom::from("@qwik.dev/core/build");
	pub static ref BUILDER_IO_QWIK_JSX: Atom = Atom::from("@qwik.dev/core/jsx-runtime");
	pub static ref BUILDER_IO_QWIK_JSX_DEV: Atom = Atom::from("@qwik.dev/core/jsx-dev-runtime");
	pub static ref QCOMPONENT: Atom = Atom::from("component$");
	pub static ref USE_LEXICAL_SCOPE: Atom = Atom::from("useLexicalScope");
	pub static ref H: Atom = Atom::from("h");
	pub static ref FRAGMENT: Atom = Atom::from("Fragment");
	pub static ref _INLINED_FN: Atom = Atom::from("_fnSignal");
	pub static ref IS_SERVER: Atom = Atom::from("isServer");
	pub static ref IS_BROWSER: Atom = Atom::from("isBrowser");
	pub static ref IS_DEV: Atom = Atom::from("isDev");
	pub static ref COMPONENT: Atom = Atom::from("component$");
	pub static ref _REG_SYMBOL: Atom = Atom::from("_regSymbol");
	pub static ref _QRL_SYNC: Atom = Atom::from("_qrlSync");
	pub static ref _WRAP_PROP: Atom = Atom::from("_wrapProp");
	pub static ref _JSX_SORTED: Atom = Atom::from("_jsxSorted");
	pub static ref _JSX_SPLIT: Atom = Atom::from("_jsxSplit");
	pub static ref JSX: Atom = Atom::from("jsx");
	pub static ref JSXS: Atom = Atom::from("jsxs");
	pub static ref JSX_DEV: Atom = Atom::from("jsxDEV");
	pub static ref _GET_VAR_PROPS: Atom = Atom::from("_getVarProps");
	pub static ref _GET_CONST_PROPS: Atom = Atom::from("_getConstProps");
}
