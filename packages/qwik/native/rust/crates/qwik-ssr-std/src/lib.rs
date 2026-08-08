//! Internal `qwik:` plugins (specs/07): the JS stdlib surface for native SSR. The runtime core
//! never grows a stdlib — extending the builtin surface means adding ops here. Dispatch is by
//! receiver runtime type, mirroring JS prototype dispatch; an op applied to a type with no
//! entry is an SSR runtime error (the JS TypeError analogue).

use qwik::serdes::SerdesValue;
use std::rc::Rc;

/// Invoke an internal-plugin op (`qwik:<ns>.<op>`), receiver first.
pub fn call(op: &str, recv: &Rc<SerdesValue>, args: &[Rc<SerdesValue>]) -> Rc<SerdesValue> {
	match op {
		"qwik:string.toUpperCase" => string_op(op, recv, args, |text| text.to_uppercase()),
		"qwik:string.toLowerCase" => string_op(op, recv, args, |text| text.to_lowercase()),
		"qwik:string.trim" => string_op(op, recv, args, |text| {
			text.trim_matches(js_whitespace).to_string()
		}),
		_ => panic!("internal plugin op {op:?} not implemented yet"),
	}
}

fn string_op(
	op: &str,
	recv: &Rc<SerdesValue>,
	args: &[Rc<SerdesValue>],
	apply: impl FnOnce(&str) -> String,
) -> Rc<SerdesValue> {
	assert!(args.is_empty(), "{op} takes no arguments");
	let SerdesValue::String(text) = &**recv else {
		panic!("{op} on a non-string receiver {recv:?}");
	};
	Rc::new(SerdesValue::String(apply(text)))
}

/// `qwik:array.filter` — higher-order ops take native closures compiled from LambdaIR.
pub fn array_filter(
	recv: &Rc<SerdesValue>,
	mut predicate: impl FnMut(&Rc<SerdesValue>) -> bool,
) -> Rc<SerdesValue> {
	let SerdesValue::Array(items) = &**recv else {
		panic!("qwik:array.filter on a non-array receiver {recv:?}");
	};
	Rc::new(SerdesValue::Array(
		items
			.iter()
			.filter(|item| predicate(item))
			.cloned()
			.collect(),
	))
}

/// JS WhiteSpace ∪ LineTerminator (ECMA-262 `TrimString`).
fn js_whitespace(ch: char) -> bool {
	ch.is_whitespace() || ch == '\u{feff}'
}
