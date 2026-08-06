//! JS-shaped runtime value model (specs/06).

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
	Undefined,
	Null,
	Bool(bool),
	Number(f64),
	String(String),
	Array(Vec<Value>),
	Object(JsObject),
}

/// Plain object with JS property semantics: writes keep insertion order (overwrites stay in
/// place), reads iterate canonical array indices ascending first, then strings in insertion order.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct JsObject {
	props: Vec<(String, Value)>,
}

impl JsObject {
	pub fn new() -> Self {
		Self::default()
	}

	pub fn insert(&mut self, key: impl Into<String>, value: Value) {
		let key = key.into();
		if let Some(existing) = self.props.iter_mut().find(|(name, _)| *name == key) {
			existing.1 = value;
		} else {
			self.props.push((key, value));
		}
	}

	pub fn get(&self, key: &str) -> Option<&Value> {
		self.props
			.iter()
			.find(|(name, _)| name == key)
			.map(|(_, value)| value)
	}

	/// Property order per ECMA OrdinaryOwnPropertyKeys.
	pub fn ordered_entries(&self) -> Vec<(&str, &Value)> {
		let mut indexed: Vec<(u32, &str, &Value)> = Vec::new();
		let mut named: Vec<(&str, &Value)> = Vec::new();
		for (key, value) in &self.props {
			match array_index_of(key) {
				Some(index) => indexed.push((index, key, value)),
				None => named.push((key, value)),
			}
		}
		indexed.sort_by_key(|(index, _, _)| *index);
		indexed
			.into_iter()
			.map(|(_, key, value)| (key, value))
			.chain(named)
			.collect()
	}

	pub fn len(&self) -> usize {
		self.props.len()
	}

	pub fn is_empty(&self) -> bool {
		self.props.is_empty()
	}
}

/// Canonical array index: decimal string of a u32 below 2^32-1, no leading zeros.
pub(crate) fn array_index_of(key: &str) -> Option<u32> {
	if key.is_empty() || (key.len() > 1 && key.starts_with('0')) {
		return None;
	}
	if !key.bytes().all(|byte| byte.is_ascii_digit()) {
		return None;
	}
	let index: u32 = key.parse().ok()?;
	if index == u32::MAX {
		return None;
	}
	Some(index)
}
