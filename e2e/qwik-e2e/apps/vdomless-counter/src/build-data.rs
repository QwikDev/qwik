//! Native implementation of `./build-data.ts` (specs/09 user plugin): same semantics —
//! LCG randomness, process-global id counter, rows of nested signals.

pub fn buildData(
	args: &[std::rc::Rc<qwik_ssr_rt::serdes::SerdesValue>],
) -> std::rc::Rc<qwik_ssr_rt::serdes::SerdesValue> {
	use qwik_ssr_rt::serdes::{SerdesValue, SignalState};
	use std::rc::Rc;
	const ADJECTIVES: &[&str] = &[
		"pretty",
		"large",
		"big",
		"small",
		"tall",
		"short",
		"long",
		"handsome",
		"plain",
		"quaint",
		"clean",
		"elegant",
		"easy",
		"angry",
		"crazy",
		"helpful",
		"mushy",
		"odd",
		"unsightly",
		"adorable",
		"important",
		"inexpensive",
		"cheap",
		"expensive",
		"fancy",
	];
	const COLORS: &[&str] = &[
		"red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black",
		"orange",
	];
	const NOUNS: &[&str] = &[
		"table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger",
		"pizza", "mouse", "keyboard",
	];
	static NEXT_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
	let count = match &*args[0] {
		SerdesValue::Number(n) => *n as usize,
		_ => 0,
	};
	let mut seed: u64 = std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.map(|d| d.subsec_nanos() as u64 ^ (d.as_secs() << 20))
		.unwrap_or(0x9e37_79b9)
		| 1;
	let mut random = |max: usize| -> usize {
		seed = seed
			.wrapping_mul(6_364_136_223_846_793_005)
			.wrapping_add(1_442_695_040_888_963_407);
		((seed >> 33) as usize) % max
	};
	let signal = |value: SerdesValue| -> Rc<SerdesValue> {
		Rc::new(SerdesValue::Signal(std::cell::RefCell::new(SignalState {
			value: Rc::new(value),
			subs: Vec::new(),
		})))
	};
	let mut rows = Vec::with_capacity(count);
	for _ in 0..count {
		let label = format!(
			"{} {} {}",
			ADJECTIVES[random(ADJECTIVES.len())],
			COLORS[random(COLORS.len())],
			NOUNS[random(NOUNS.len())]
		);
		let id = NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
		rows.push(Rc::new(SerdesValue::Object(vec![
			("id".to_string(), Rc::new(SerdesValue::Number(id as f64))),
			("label".to_string(), signal(SerdesValue::String(label))),
			("selected".to_string(), signal(SerdesValue::Bool(false))),
		])));
	}
	Rc::new(SerdesValue::Array(rows))
}
