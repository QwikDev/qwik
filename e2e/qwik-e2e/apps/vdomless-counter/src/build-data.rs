//! Native implementation of `./build-data.ts` (specs/09 user plugin): same semantics —
//! LCG randomness, process-global id counter, rows of nested signals.

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

/// A spliced sidecar cannot pull in `rand`, so entropy comes from std's per-process hasher keys.
fn random(max: usize) -> usize {
	use std::collections::hash_map::RandomState;
	use std::hash::{BuildHasher, Hasher};
	(RandomState::new().build_hasher().finish() as usize) % max
}

pub fn buildData(count: usize) -> Vec<Row> {
	let mut rows = Vec::with_capacity(count);
	for _ in 0..count {
		let label = format!(
			"{} {} {}",
			ADJECTIVES[random(ADJECTIVES.len())],
			COLORS[random(COLORS.len())],
			NOUNS[random(NOUNS.len())]
		);
		rows.push(Row {
			id: NEXT_ID.fetch_add(1, Ordering::Relaxed),
			label: Signal::new(label),
			selected: Signal::new(false),
		});
	}
	rows
}
