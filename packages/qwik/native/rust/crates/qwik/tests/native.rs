//! `native$` author surface (specs/09): an implementation is plain Rust, and the generated call
//! site converts across the boundary. Each test mirrors what `qwik-ssr-gen` emits for a call.

use qwik::native::{arg, Serdes, Signal};
use qwik::serdes::SerdesValue;

#[derive(Serdes)]
pub struct Row {
	id: u64,
	label: Signal<String>,
}

// nothing Qwik-shaped: this is what an author writes
#[allow(non_snake_case)]
pub fn buildRows(count: usize, prefix: String) -> Vec<Row> {
	(0..count)
		.map(|index| Row {
			id: index as u64,
			label: Signal::new(format!("{prefix}{index}")),
		})
		.collect()
}

#[test]
fn a_generated_call_converts_both_directions() {
	let result = Serdes::into_serdes(buildRows(
		arg(&SerdesValue::Number(2.0), "buildRows", 0),
		arg(&SerdesValue::String("row-".to_string()), "buildRows", 1),
	));

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
#[should_panic(expected = "native fn buildRows: argument 0: expected number, got string")]
fn an_argument_type_mismatch_names_the_call() {
	let count: usize = arg(&SerdesValue::String("not a count".to_string()), "buildRows", 0);
	let _ = count;
}
