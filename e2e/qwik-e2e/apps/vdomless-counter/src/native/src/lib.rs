//! Native implementation of `../build-data.ts` (specs/09): same semantics — random labels, a
//! process-global id counter, rows of nested signals.
// exports are named after the JS export they implement, which is camelCase
#![allow(non_snake_case)]

use rand::Rng;

use qwik::native::{IntoSerdes, Signal};
use qwik::serdes::SerdesValue;
use std::rc::Rc;
use std::sync::atomic::{AtomicU64, Ordering};

const ADJECTIVES: &[&str] = &[
	"pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint",
	"clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly",
	"adorable", "important", "inexpensive", "cheap", "expensive", "fancy",
];
const COLORS: &[&str] = &[
	"red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black",
	"orange",
];
const NOUNS: &[&str] = &[
	"table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger",
	"pizza", "mouse", "keyboard",
];

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

pub struct Row {
	id: u64,
	label: Signal<String>,
	selected: Signal<bool>,
}

impl IntoSerdes for Row {
	fn into_serdes(self) -> Rc<SerdesValue> {
		Rc::new(SerdesValue::Object(vec![
			("id".to_string(), self.id.into_serdes()),
			("label".to_string(), self.label.into_serdes()),
			("selected".to_string(), self.selected.into_serdes()),
		]))
	}
}

pub fn buildData(count: usize) -> Vec<Row> {
	let mut rng = rand::rng();
	let mut pick = |words: &[&str]| words[rng.random_range(0..words.len())].to_string();
	let mut rows = Vec::with_capacity(count);
	for _ in 0..count {
		let label = format!("{} {} {}", pick(ADJECTIVES), pick(COLORS), pick(NOUNS));
		rows.push(Row {
			id: NEXT_ID.fetch_add(1, Ordering::Relaxed),
			label: Signal::new(label),
			selected: Signal::new(false),
		});
	}
	rows
}
