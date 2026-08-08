//! `native$` author surface (specs/09): a typed implementation must round-trip through the
//! untyped `&[Rc<SerdesValue>]` ABI the generator emits, and reject a mismatch loudly.

use qwik_ssr_rt::native::{IntoSerdes, Signal};
use qwik_ssr_rt::serdes::SerdesValue;
use std::rc::Rc;

struct Row {
	id: u64,
	label: Signal<String>,
}

impl IntoSerdes for Row {
	fn into_serdes(self) -> Rc<SerdesValue> {
		Rc::new(SerdesValue::Object(vec![
			("id".to_string(), self.id.into_serdes()),
			("label".to_string(), self.label.into_serdes()),
		]))
	}
}

qwik_ssr_rt::native_fn! {
	pub fn buildRows(count: usize, prefix: String) -> Vec<Row> {
		(0..count)
			.map(|index| Row {
				id: index as u64,
				label: Signal::new(format!("{prefix}{index}")),
			})
			.collect()
	}
}

#[test]
fn typed_signature_round_trips_through_the_untyped_abi() {
	let result = buildRows(&[
		Rc::new(SerdesValue::Number(2.0)),
		Rc::new(SerdesValue::String("row-".to_string())),
	]);

	let SerdesValue::Array(rows) = &*result else {
		panic!("expected an array");
	};
	assert_eq!(rows.len(), 2);

	let SerdesValue::Object(fields) = &*rows[1] else {
		panic!("expected an object row");
	};
	assert_eq!(fields[0].0, "id");
	assert!(matches!(&*fields[0].1, SerdesValue::Number(id) if *id == 1.0));

	// the signal field stays a reactive cell across the boundary, not flattened to its value
	let SerdesValue::Signal(state) = &*fields[1].1 else {
		panic!("expected a signal field");
	};
	let state = state.borrow();
	assert!(matches!(&*state.value, SerdesValue::String(label) if label == "row-1"));
	assert!(state.subs.is_empty());
}

#[test]
#[should_panic(expected = "native fn buildRows: argument count: expected number, got string")]
fn argument_type_mismatch_names_the_function_and_parameter() {
	buildRows(&[
		Rc::new(SerdesValue::String("not a count".to_string())),
		Rc::new(SerdesValue::String("row-".to_string())),
	]);
}

#[test]
#[should_panic(expected = "native fn buildRows: missing argument 1 (prefix)")]
fn a_missing_argument_names_the_parameter() {
	buildRows(&[Rc::new(SerdesValue::Number(1.0))]);
}
