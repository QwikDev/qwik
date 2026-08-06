//! `qwik/state` serializer (specs/04, freeze spec). Byte-compatible with
//! `packages/qwik/src/core/shared/serdes/serialize.ts` + `server/ssr-script-emitter.ts`,
//! proven by the Layer-0 `serdes.json` corpus.

use crate::number::to_js_string;
use crate::value::array_index_of;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

/// Serializable heap value. Compound variants have JS object identity via `Rc` pointers;
/// primitives compare by value (SameValueZero).
#[derive(Debug)]
pub enum SerdesValue {
	Undefined,
	Null,
	Bool(bool),
	Number(f64),
	String(String),
	Array(Vec<Rc<SerdesValue>>),
	Object(Vec<(String, Rc<SerdesValue>)>),
	Date(f64),
	Url(String),
	Regex {
		source: String,
		flags: String,
	},
	BigInt(String),
	Map(Vec<(Rc<SerdesValue>, Rc<SerdesValue>)>),
	Set(Vec<Rc<SerdesValue>>),
	Bytes(Vec<u8>),
	Signal(RefCell<SignalState>),
	Qrl(QrlValue),
	Props(PropsValue),
	Store(RefCell<StoreState>),
	/// Tracked read handle for one store prop — the dep shape stores serialize (TypeId 47).
	StoreProp {
		store: Rc<SerdesValue>,
		prop: String,
	},
	SlotScope(RefCell<SlotScopeState>),
	/// Context scope (TypeId 43): `[parent, key, value, …]` flat pairs.
	ContextScope(RefCell<ContextScopeState>),
	Projection(ProjectionValue),
	/// The `EMPTY_ARRAY` flyweight — encodes as a Constant by identity (specs/04).
	EmptyArray,
	/// Reactive effect record (TypeId 41); shared between subscriber lists and owner items.
	Effect(RefCell<EffectValue>),
	Task(TaskValue),
	Computed(RefCell<ComputedState>),
}

#[derive(Debug)]
pub struct TaskValue {
	pub phase: u8,
	pub qrl: Rc<SerdesValue>,
	pub deps: Vec<Rc<SerdesValue>>,
}

#[derive(Debug)]
pub struct ComputedState {
	pub qrl: Rc<SerdesValue>,
	pub deps: Vec<Rc<SerdesValue>>,
	/// `None` until first read → NEEDS_COMPUTATION on the wire.
	pub value: Option<Rc<SerdesValue>>,
	pub subs: Vec<Rc<SerdesValue>>,
}

#[derive(Debug)]
pub enum EffectValue {
	Scalar(EffectSubscription),
	Branch(BranchEffect),
	ForBlock(ForBlockEffect),
	Content(ContentEffect),
}

/// `[3, rangeId, currentBranch, deps, conditionQrl, thenQrl, elseQrl, ownerItems, null, null, idBase]`
#[derive(Debug)]
pub struct BranchEffect {
	pub range_id: u32,
	pub current_branch: u32,
	pub deps: Vec<Rc<SerdesValue>>,
	pub condition_qrl: Rc<SerdesValue>,
	pub then_qrl: Rc<SerdesValue>,
	pub else_qrl: Option<Rc<SerdesValue>>,
	pub owner_items: Vec<Rc<SerdesValue>>,
	pub id_base: String,
}

/// `[5, rangeId, deps, keyQrl, renderQrl, usesIndexSignal, null, null, indexSignals, idBase, rowShape]`
#[derive(Debug)]
pub struct ForBlockEffect {
	pub range_id: u32,
	pub deps: Vec<Rc<SerdesValue>>,
	pub key_qrl: Rc<SerdesValue>,
	pub render_qrl: Rc<SerdesValue>,
	pub uses_index_signal: bool,
	/// `None` (→ Constant Null) when the block does not use index signals.
	pub index_signals: Option<Vec<Rc<SerdesValue>>>,
	pub id_base: String,
	pub row_shape: u8,
}

/// `[7, rangeId, deps, args, qrl, ownerItems(empty), null, null, contextArg]`
#[derive(Debug)]
pub struct ContentEffect {
	pub range_id: u32,
	pub deps: Vec<Rc<SerdesValue>>,
	pub args: Vec<Rc<SerdesValue>>,
	pub qrl: Rc<SerdesValue>,
	pub context_arg: bool,
}

#[derive(Debug)]
pub struct ContextScopeState {
	pub parent: Option<Rc<SerdesValue>>,
	pub entries: Vec<(String, Rc<SerdesValue>)>,
}

/// Slot scope: projection lists keyed by slot name (TypeId 44, flat pairs on the wire).
#[derive(Debug)]
pub struct SlotScopeState {
	pub projections: Vec<(String, Vec<Rc<SerdesValue>>)>,
}

/// One projected slot render (TypeId 45): `[renderQrl, slotScope, idBase]`.
#[derive(Debug)]
pub struct ProjectionValue {
	pub render_qrl: Rc<SerdesValue>,
	pub slot_scope: Option<Rc<SerdesValue>>,
	pub id_base: String,
}

/// Deep store: raw target object plus per-prop source records with their subscribers.
#[derive(Debug)]
pub struct StoreState {
	pub raw: Rc<SerdesValue>,
	pub records: Vec<StoreRecord>,
	/// Interned per-prop handles: reads share one StoreProp identity, like the JS proxy cache.
	/// The store→handle→store Rc cycle only lives until process teardown.
	pub prop_handles: Vec<(String, Rc<SerdesValue>)>,
}

#[derive(Debug)]
pub struct StoreRecord {
	pub prop: String,
	pub subs: Vec<Rc<SerdesValue>>,
}

/// Component props with reactive sources (`_props`): statics read directly, sources track.
#[derive(Debug)]
pub struct PropsValue {
	pub statics: Vec<(String, Rc<SerdesValue>)>,
	pub sources: Vec<(String, Rc<SerdesValue>)>,
}

#[derive(Debug)]
pub struct SignalState {
	pub value: Rc<SerdesValue>,
	pub subs: Vec<Rc<SerdesValue>>,
}

#[derive(Debug)]
pub struct QrlValue {
	/// Chunk specifier with any `./` prefix already stripped.
	pub chunk: String,
	pub symbol: String,
	pub captures: Vec<Rc<SerdesValue>>,
}

/// Scalar-shaped effect subscription (specs/04 sub-table, kinds 0/1/2/4/8).
#[derive(Debug)]
pub struct EffectSubscription {
	pub kind: u8,
	pub target_kind: u8,
	pub target_id: u32,
	/// Present only when `target_kind` is RangeText — shifts later fields by one.
	pub marker_index: Option<u32>,
	pub deps: Vec<Rc<SerdesValue>>,
	/// Attr(2): attribute name; followed on the wire by a null styleScopedId.
	pub attr_name: Option<String>,
	/// TextExpression(1)/Attr-expression/Props: capture values passed to the QRL on resume.
	pub args: Option<Vec<Rc<SerdesValue>>>,
	/// Resume QRL for expression-shaped effects.
	pub qrl: Option<Rc<SerdesValue>>,
}

pub const EFFECT_KIND_TEXT_NODE: u8 = 0;
pub const EFFECT_KIND_TEXT_EXPRESSION: u8 = 1;
pub const EFFECT_KIND_ATTR: u8 = 2;
pub const EFFECT_TARGET_ELEMENT_TEXT: u8 = 0;
pub const EFFECT_TARGET_RANGE_TEXT: u8 = 1;
pub const EFFECT_TARGET_ELEMENT: u8 = 2;

// TypeIds (serdes/type-id.ts) — only the ids this serializer emits.
const TYPE_PLAIN: u8 = 0;
const TYPE_ROOT_REF: u8 = 1;
const TYPE_CONSTANT: u8 = 3;
const TYPE_ARRAY: u8 = 4;
const TYPE_OBJECT: u8 = 5;
const TYPE_URL: u8 = 6;
const TYPE_DATE: u8 = 7;
const TYPE_REGEX: u8 = 8;
const TYPE_QRL: u8 = 9;
const TYPE_BIGINT: u8 = 12;
const TYPE_SIGNAL: u8 = 30;
const TYPE_PROPS: u8 = 39;
const TYPE_STORE: u8 = 35;
const TYPE_STORE_PROP: u8 = 47;
const TYPE_SLOT_SCOPE: u8 = 44;
const TYPE_CONTEXT_SCOPE: u8 = 43;
const TYPE_PROJECTION: u8 = 45;
const TYPE_EFFECT_SUBSCRIPTION: u8 = 41;
const TYPE_SET: u8 = 25;
const TYPE_MAP: u8 = 26;
const TYPE_UINT8ARRAY: u8 = 27;
const TYPE_BIG_ARRAY: u8 = 46;
const TYPE_TASK: u8 = 28;
const TYPE_COMPUTED: u8 = 32;

// Constants (serdes/constants.ts).
const CONST_UNDEFINED: f64 = 0.0;
const CONST_NULL: f64 = 1.0;
const CONST_TRUE: f64 = 2.0;
const CONST_FALSE: f64 = 3.0;
const CONST_EMPTY_STRING: f64 = 4.0;
const CONST_EMPTY_ARRAY: f64 = 5.0;
const CONST_NEEDS_COMPUTATION: f64 = 7.0;
const CONST_NAN: f64 = 12.0;
const CONST_INFINITY: f64 = 13.0;
const CONST_NEG_INFINITY: f64 = 14.0;
const CONST_MAX_SAFE_INT: f64 = 15.0;
const CONST_ALMOST_MAX_SAFE_INT: f64 = 16.0;
const CONST_MIN_SAFE_INT: f64 = 17.0;
const CONST_COLON: f64 = 18.0;
const CONST_DOT: f64 = 19.0;
const CONST_ID: f64 = 20.0;
const CONST_REF: f64 = 21.0;

const MAX_SAFE_INTEGER: f64 = 9007199254740991.0;
const MAX_INLINE_ARRAY_ITEMS: usize = 64;
const MAX_STATE_ROOTS_PER_SCRIPT: usize = 1024;
/// Strings shorter than this are never deduped into roots.
const MIN_DEDUPED_STRING_LEN: usize = 4;

/// Serialized JSON node — kept structured so the chunked path can re-encode
/// (`JSON.parse` → slice → `JSON.stringify`) exactly like the JS emitter.
#[derive(Debug, Clone)]
pub enum Payload {
	Num(f64),
	Str(String),
	Arr(Vec<Payload>),
}

/// SameValueZero key: primitives by value (-0 folded to 0, NaN canonical), compounds by identity.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum RootKey {
	Undefined,
	Null,
	Bool(bool),
	Number(u64),
	Str(String),
	Ptr(usize),
}

fn root_key(value: &Rc<SerdesValue>) -> RootKey {
	match &**value {
		SerdesValue::Undefined => RootKey::Undefined,
		SerdesValue::Null => RootKey::Null,
		SerdesValue::Bool(boolean) => RootKey::Bool(*boolean),
		SerdesValue::Number(number) => {
			let canonical = if *number == 0.0 {
				0.0
			} else if number.is_nan() {
				f64::NAN
			} else {
				*number
			};
			RootKey::Number(canonical.to_bits())
		}
		SerdesValue::String(text) => RootKey::Str(text.clone()),
		_ => RootKey::Ptr(Rc::as_ptr(value) as *const u8 as usize),
	}
}

/// Only compounds (identity) and strings ≥ 4 chars participate in RootRef dedup.
fn is_dedup_eligible(value: &SerdesValue) -> bool {
	match value {
		SerdesValue::String(text) => text.len() >= MIN_DEDUPED_STRING_LEN,
		SerdesValue::Undefined
		| SerdesValue::Null
		| SerdesValue::Bool(_)
		| SerdesValue::Number(_)
		| SerdesValue::EmptyArray => false,
		_ => true,
	}
}

enum PendingRoot {
	Value(Rc<SerdesValue>),
	/// Promotion target: the slot holds a backref path to the first inline occurrence.
	Backref(String),
}

pub struct Serializer {
	roots: Vec<PendingRoot>,
	index: HashMap<RootKey, usize>,
	seen_paths: HashMap<RootKey, String>,
	/// QRL *string* dedup (distinct objects, identical encoding) — specs/04.
	qrl_index: HashMap<String, usize>,
	qrl_seen: HashMap<String, String>,
}

impl Default for Serializer {
	fn default() -> Self {
		Self::new()
	}
}

impl Serializer {
	pub fn new() -> Self {
		Self {
			roots: Vec::new(),
			index: HashMap::new(),
			seen_paths: HashMap::new(),
			qrl_index: HashMap::new(),
			qrl_seen: HashMap::new(),
		}
	}

	pub fn root_count(&self) -> usize {
		self.roots.len()
	}

	/// Root id for a value, promoting an inline first occurrence to a backref root if needed
	/// (`StoreProp.targetRootId` — a Plain number on the wire, never a RootRef).
	fn promote_to_root(&mut self, value: &Rc<SerdesValue>) -> usize {
		let key = root_key(value);
		if let Some(&existing) = self.index.get(&key) {
			return existing;
		}
		if let Some(first_path) = self.seen_paths.get(&key) {
			let id = self.roots.len();
			self.roots.push(PendingRoot::Backref(first_path.clone()));
			self.index.insert(key, id);
			return id;
		}
		self.add_root(Rc::clone(value))
	}

	/// Register a root; identical values (SameValueZero) reuse the existing root id.
	pub fn add_root(&mut self, value: Rc<SerdesValue>) -> usize {
		let key = root_key(&value);
		if let Some(&existing) = self.index.get(&key) {
			return existing;
		}
		let id = self.roots.len();
		self.roots.push(PendingRoot::Value(value));
		self.index.insert(key, id);
		id
	}

	/// Serialize all roots (the worklist grows during traversal) into `(typeId, payload)` pairs.
	pub fn serialize(mut self) -> Vec<(u8, Payload)> {
		let mut output = Vec::new();
		let mut index = 0;
		while index < self.roots.len() {
			let pair = match &self.roots[index] {
				PendingRoot::Backref(path) => (TYPE_ROOT_REF, Payload::Str(path.clone())),
				PendingRoot::Value(value) => {
					let value = Rc::clone(value);
					let mut path = vec![index];
					self.write(&value, index, &mut path)
				}
			};
			output.push(pair);
			index += 1;
		}
		output
	}

	fn write(
		&mut self,
		value: &Rc<SerdesValue>,
		current_root: usize,
		path: &mut Vec<usize>,
	) -> (u8, Payload) {
		if is_dedup_eligible(value) {
			let key = root_key(value);
			let at_root_slot = path.len() == 1;
			if let Some(&id) = self.index.get(&key) {
				// self-reference at root level short-circuits to inline data
				if !(at_root_slot && id == current_root) {
					return (TYPE_ROOT_REF, Payload::Num(id as f64));
				}
			} else if let Some(first_path) = self.seen_paths.get(&key) {
				// second sighting: new root's slot backrefs the inline data
				let id = self.roots.len();
				self.roots.push(PendingRoot::Backref(first_path.clone()));
				self.index.insert(key, id);
				return (TYPE_ROOT_REF, Payload::Num(id as f64));
			} else {
				let joined = path
					.iter()
					.map(|segment| segment.to_string())
					.collect::<Vec<_>>()
					.join(" ");
				self.seen_paths.insert(key, joined);
			}
		}
		self.write_inline(value, current_root, path)
	}

	fn write_inline(
		&mut self,
		value: &Rc<SerdesValue>,
		current_root: usize,
		path: &mut Vec<usize>,
	) -> (u8, Payload) {
		match &**value {
			SerdesValue::Undefined => (TYPE_CONSTANT, Payload::Num(CONST_UNDEFINED)),
			SerdesValue::Null => (TYPE_CONSTANT, Payload::Num(CONST_NULL)),
			SerdesValue::Bool(true) => (TYPE_CONSTANT, Payload::Num(CONST_TRUE)),
			SerdesValue::Bool(false) => (TYPE_CONSTANT, Payload::Num(CONST_FALSE)),
			SerdesValue::Number(number) => write_number(*number),
			SerdesValue::String(text) => match text.as_str() {
				"" => (TYPE_CONSTANT, Payload::Num(CONST_EMPTY_STRING)),
				":" => (TYPE_CONSTANT, Payload::Num(CONST_COLON)),
				"." => (TYPE_CONSTANT, Payload::Num(CONST_DOT)),
				"id" => (TYPE_CONSTANT, Payload::Num(CONST_ID)),
				"ref" => (TYPE_CONSTANT, Payload::Num(CONST_REF)),
				_ => (TYPE_PLAIN, Payload::Str(text.clone())),
			},
			SerdesValue::Array(items) => self.write_array(items, current_root, path),
			SerdesValue::Object(entries) => self.write_object(entries, current_root, path),
			SerdesValue::Date(epoch_millis) => (TYPE_DATE, Payload::Num(*epoch_millis)),
			SerdesValue::Url(href) => (TYPE_URL, Payload::Str(href.clone())),
			SerdesValue::Regex { source, flags } => {
				(TYPE_REGEX, Payload::Str(format!("/{source}/{flags}")))
			}
			SerdesValue::BigInt(digits) => (TYPE_BIGINT, Payload::Str(digits.clone())),
			SerdesValue::Map(entries) => {
				let mut pairs = Vec::with_capacity(entries.len() * 4);
				for (position, (map_key, map_value)) in entries.iter().enumerate() {
					path.push(position * 2);
					push_pair(&mut pairs, self.write(map_key, current_root, path));
					*path.last_mut().unwrap() = position * 2 + 1;
					push_pair(&mut pairs, self.write(map_value, current_root, path));
					path.pop();
				}
				(TYPE_MAP, Payload::Arr(pairs))
			}
			SerdesValue::Set(items) => {
				let mut pairs = Vec::with_capacity(items.len() * 2);
				for (position, item) in items.iter().enumerate() {
					path.push(position);
					push_pair(&mut pairs, self.write(item, current_root, path));
					path.pop();
				}
				(TYPE_SET, Payload::Arr(pairs))
			}
			SerdesValue::Bytes(bytes) => (TYPE_UINT8ARRAY, Payload::Str(base64_no_pad(bytes))),
			SerdesValue::Signal(state) => {
				let state = state.borrow();
				let mut pairs = Vec::new();
				path.push(0);
				push_pair(&mut pairs, self.write(&state.value, current_root, path));
				for (position, sub) in state.subs.iter().enumerate() {
					*path.last_mut().unwrap() = position + 1;
					let pair = self.write(sub, current_root, path);
					push_pair(&mut pairs, pair);
				}
				path.pop();
				(TYPE_SIGNAL, Payload::Arr(pairs))
			}
			SerdesValue::EmptyArray => (TYPE_CONSTANT, Payload::Num(CONST_EMPTY_ARRAY)),
			SerdesValue::Effect(effect) => {
				let payload = self.write_effect(&effect.borrow(), current_root, path);
				(TYPE_EFFECT_SUBSCRIPTION, payload)
			}
			SerdesValue::Task(task) => {
				let mut pairs = Vec::new();
				push_pair(&mut pairs, (TYPE_PLAIN, Payload::Num(task.phase as f64)));
				path.push(1);
				let qrl_pair = self.write(&task.qrl, current_root, path);
				push_pair(&mut pairs, qrl_pair);
				*path.last_mut().unwrap() = 2;
				if task.deps.is_empty() {
					push_pair(&mut pairs, (TYPE_CONSTANT, Payload::Num(CONST_EMPTY_ARRAY)));
				} else {
					let deps_pair = self.write_value_list(&task.deps, current_root, path);
					push_pair(&mut pairs, deps_pair);
				}
				path.pop();
				(TYPE_TASK, Payload::Arr(pairs))
			}
			SerdesValue::Computed(state) => {
				let state = state.borrow();
				let mut pairs = Vec::new();
				path.push(0);
				let qrl_pair = self.write(&state.qrl, current_root, path);
				push_pair(&mut pairs, qrl_pair);
				*path.last_mut().unwrap() = 1;
				if state.deps.is_empty() {
					push_pair(&mut pairs, (TYPE_CONSTANT, Payload::Num(CONST_EMPTY_ARRAY)));
				} else {
					let deps_pair = self.write_value_list(&state.deps, current_root, path);
					push_pair(&mut pairs, deps_pair);
				}
				*path.last_mut().unwrap() = 2;
				match &state.value {
					Some(value) => {
						let value_pair = self.write(value, current_root, path);
						push_pair(&mut pairs, value_pair);
					}
					None => push_pair(
						&mut pairs,
						(TYPE_CONSTANT, Payload::Num(CONST_NEEDS_COMPUTATION)),
					),
				}
				for (position, sub) in state.subs.iter().enumerate() {
					*path.last_mut().unwrap() = 3 + position;
					let pair = self.write(sub, current_root, path);
					push_pair(&mut pairs, pair);
				}
				path.pop();
				(TYPE_COMPUTED, Payload::Arr(pairs))
			}
			SerdesValue::Props(props) => {
				let mut statics_pairs = Vec::new();
				for (position, (key, item)) in props.statics.iter().enumerate() {
					let key_pair = self.write_key(key, current_root, path, position * 2);
					push_pair(&mut statics_pairs, key_pair);
					path.push(position * 2 + 1);
					push_pair(&mut statics_pairs, self.write(item, current_root, path));
					path.pop();
				}
				let mut sources_pairs = Vec::new();
				for (position, (key, source)) in props.sources.iter().enumerate() {
					let key_pair = self.write_key(key, current_root, path, position * 2);
					push_pair(&mut sources_pairs, key_pair);
					path.push(position * 2 + 1);
					push_pair(&mut sources_pairs, self.write(source, current_root, path));
					path.pop();
				}
				let mut pairs = Vec::new();
				push_pair(&mut pairs, (TYPE_ARRAY, Payload::Arr(statics_pairs)));
				push_pair(&mut pairs, (TYPE_OBJECT, Payload::Arr(sources_pairs)));
				(TYPE_PROPS, Payload::Arr(pairs))
			}
			SerdesValue::Store(state) => {
				let state = state.borrow();
				let mut pairs = Vec::new();
				path.push(0);
				push_pair(&mut pairs, self.write(&state.raw, current_root, path));
				if !state.records.is_empty() {
					*path.last_mut().unwrap() = 1;
					let mut record_pairs = Vec::new();
					for (record_index, record) in state.records.iter().enumerate() {
						// record layout: [path[], prop, ...subs] — logical 0 is the paths array
						path.push(record_index);
						let mut items = Vec::new();
						push_pair(&mut items, (TYPE_ARRAY, Payload::Arr(Vec::new())));
						path.push(1);
						push_pair(
							&mut items,
							self.write(
								&Rc::new(SerdesValue::String(record.prop.clone())),
								current_root,
								path,
							),
						);
						for (sub_index, sub) in record.subs.iter().enumerate() {
							*path.last_mut().unwrap() = 2 + sub_index;
							let pair = self.write(sub, current_root, path);
							push_pair(&mut items, pair);
						}
						path.pop();
						push_pair(&mut record_pairs, (TYPE_ARRAY, Payload::Arr(items)));
						path.pop();
					}
					push_pair(&mut pairs, (TYPE_ARRAY, Payload::Arr(record_pairs)));
				}
				path.pop();
				(TYPE_STORE, Payload::Arr(pairs))
			}
			SerdesValue::StoreProp { store, prop } => {
				let SerdesValue::Store(state) = &**store else {
					panic!("StoreProp must reference a Store");
				};
				let raw = Rc::clone(&state.borrow().raw);
				let target_root = self.promote_to_root(&raw);
				let mut pairs = Vec::new();
				push_pair(&mut pairs, (TYPE_PLAIN, Payload::Num(target_root as f64)));
				// the prop key is element 1 — its first-seen path must include the step
				path.push(1);
				let prop_pair = self.write(
					&Rc::new(SerdesValue::String(prop.clone())),
					current_root,
					path,
				);
				path.pop();
				push_pair(&mut pairs, prop_pair);
				(TYPE_STORE_PROP, Payload::Arr(pairs))
			}
			SerdesValue::ContextScope(state) => {
				let state = state.borrow();
				let mut pairs = Vec::new();
				match &state.parent {
					Some(parent) => {
						path.push(0);
						let parent_pair = self.write(parent, current_root, path);
						path.pop();
						push_pair(&mut pairs, parent_pair);
					}
					None => push_pair(&mut pairs, (TYPE_CONSTANT, Payload::Num(CONST_NULL))),
				}
				for (position, (key, value)) in state.entries.iter().enumerate() {
					path.push(position * 2 + 1);
					let key_pair = self.write(
						&Rc::new(SerdesValue::String(key.clone())),
						current_root,
						path,
					);
					push_pair(&mut pairs, key_pair);
					*path.last_mut().unwrap() = position * 2 + 2;
					let value_pair = self.write(value, current_root, path);
					push_pair(&mut pairs, value_pair);
					path.pop();
				}
				(TYPE_CONTEXT_SCOPE, Payload::Arr(pairs))
			}
			SerdesValue::SlotScope(state) => {
				let state = state.borrow();
				let mut pairs = Vec::new();
				for (position, (name, projections)) in state.projections.iter().enumerate() {
					path.push(position * 2);
					let name_pair = self.write(
						&Rc::new(SerdesValue::String(name.clone())),
						current_root,
						path,
					);
					push_pair(&mut pairs, name_pair);
					*path.last_mut().unwrap() = position * 2 + 1;
					let list_pair = self.write_value_list(projections, current_root, path);
					push_pair(&mut pairs, list_pair);
					path.pop();
				}
				(TYPE_SLOT_SCOPE, Payload::Arr(pairs))
			}
			SerdesValue::Projection(projection) => {
				let mut pairs = Vec::new();
				path.push(0);
				let qrl_pair = self.write(&projection.render_qrl, current_root, path);
				push_pair(&mut pairs, qrl_pair);
				match &projection.slot_scope {
					Some(scope) => {
						*path.last_mut().unwrap() = 1;
						let scope_pair = self.write(scope, current_root, path);
						push_pair(&mut pairs, scope_pair);
					}
					None => push_pair(&mut pairs, (TYPE_CONSTANT, Payload::Num(CONST_NULL))),
				}
				*path.last_mut().unwrap() = 2;
				let base_pair = self.write(
					&Rc::new(SerdesValue::String(projection.id_base.clone())),
					current_root,
					path,
				);
				push_pair(&mut pairs, base_pair);
				path.pop();
				(TYPE_PROJECTION, Payload::Arr(pairs))
			}
			// state form: `${chunkRootId}#${symbolRootId - chunkRootId}[#deltas]`, chunk and
			// symbol strings appended to the root worklist; first delta rebased on symbolRootId
			SerdesValue::Qrl(qrl) => {
				let chunk_id =
					self.add_root(Rc::new(SerdesValue::String(qrl.chunk.clone()))) as i64;
				let symbol_id =
					self.add_root(Rc::new(SerdesValue::String(qrl.symbol.clone()))) as i64;
				let mut encoded = format!("{chunk_id}#{}", symbol_id - chunk_id);
				let mut previous = symbol_id;
				for (position, capture) in qrl.captures.iter().enumerate() {
					let capture_id = self.add_root(Rc::clone(capture)) as i64;
					encoded.push(if position == 0 { '#' } else { ' ' });
					encoded.push_str(&(capture_id - previous).to_string());
					previous = capture_id;
				}
				// distinct QRL objects with identical encodings dedup by string (specs/04)
				if let Some(&existing) = self.qrl_index.get(&encoded) {
					return (TYPE_ROOT_REF, Payload::Num(existing as f64));
				}
				if let Some(first_path) = self.qrl_seen.get(&encoded) {
					let id = self.roots.len();
					self.roots.push(PendingRoot::Backref(first_path.clone()));
					self.qrl_index.insert(encoded, id);
					return (TYPE_ROOT_REF, Payload::Num(id as f64));
				}
				let joined = path
					.iter()
					.map(|segment| segment.to_string())
					.collect::<Vec<_>>()
					.join(" ");
				self.qrl_seen.insert(encoded.clone(), joined);
				(TYPE_QRL, Payload::Str(encoded))
			}
		}
	}

	fn write_effect(
		&mut self,
		effect: &EffectValue,
		current_root: usize,
		path: &mut Vec<usize>,
	) -> Payload {
		let mut pairs = Vec::new();
		let mut logical = 0usize;
		macro_rules! plain {
			($value:expr) => {{
				push_pair(&mut pairs, (TYPE_PLAIN, Payload::Num($value as f64)));
				logical += 1;
			}};
		}
		macro_rules! constant {
			($value:expr) => {{
				push_pair(&mut pairs, (TYPE_CONSTANT, Payload::Num($value)));
				logical += 1;
			}};
		}
		macro_rules! child {
			($value:expr) => {{
				path.push(logical);
				let pair = self.write($value, current_root, path);
				path.pop();
				push_pair(&mut pairs, pair);
				logical += 1;
			}};
		}
		macro_rules! list {
			($values:expr) => {{
				if $values.is_empty() {
					constant!(CONST_EMPTY_ARRAY);
				} else {
					path.push(logical);
					let pair = self.write_value_list($values, current_root, path);
					path.pop();
					push_pair(&mut pairs, pair);
					logical += 1;
				}
			}};
		}
		macro_rules! text {
			($value:expr) => {{
				path.push(logical);
				let pair = self.write(
					&Rc::new(SerdesValue::String($value.clone())),
					current_root,
					path,
				);
				path.pop();
				push_pair(&mut pairs, pair);
				logical += 1;
			}};
		}
		match effect {
			EffectValue::Scalar(scalar) => {
				plain!(scalar.kind);
				plain!(scalar.target_kind);
				plain!(scalar.target_id);
				if let Some(marker_index) = scalar.marker_index {
					plain!(marker_index);
				}
				list!(&scalar.deps);
				if let Some(attr_name) = &scalar.attr_name {
					text!(attr_name);
				}
				if let Some(args) = &scalar.args {
					list!(args);
				}
				if let Some(qrl) = &scalar.qrl {
					child!(qrl);
				}
				if scalar.attr_name.is_some() {
					// Attr styleScopedId slot — scoped styles unsupported, always null
					constant!(CONST_NULL);
				}
			}
			EffectValue::Branch(branch) => {
				plain!(3u8);
				plain!(branch.range_id);
				plain!(branch.current_branch);
				list!(&branch.deps);
				child!(&branch.condition_qrl);
				child!(&branch.then_qrl);
				match &branch.else_qrl {
					Some(else_qrl) => child!(else_qrl),
					None => constant!(CONST_NULL),
				}
				list!(&branch.owner_items);
				constant!(CONST_NULL); // slotScope
				constant!(CONST_NULL); // useOnScopes
				text!(branch.id_base);
			}
			EffectValue::ForBlock(for_block) => {
				plain!(5u8);
				plain!(for_block.range_id);
				list!(&for_block.deps);
				child!(&for_block.key_qrl);
				child!(&for_block.render_qrl);
				constant!(if for_block.uses_index_signal {
					CONST_TRUE
				} else {
					CONST_FALSE
				});
				constant!(CONST_NULL); // slotScope
				constant!(CONST_NULL); // reserved slot 7
				match &for_block.index_signals {
					Some(index_signals) => list!(index_signals),
					None => constant!(CONST_NULL),
				}
				text!(for_block.id_base);
				plain!(for_block.row_shape);
			}
			EffectValue::Content(content) => {
				plain!(7u8);
				plain!(content.range_id);
				list!(&content.deps);
				// args are a literal array in the emitted code — never the EMPTY_ARRAY flyweight
				{
					path.push(logical);
					let pair = self.write_value_list(&content.args, current_root, path);
					path.pop();
					push_pair(&mut pairs, pair);
					logical += 1;
				}
				child!(&content.qrl);
				constant!(CONST_EMPTY_ARRAY); // ownerItems
				constant!(CONST_NULL); // slotScope
				constant!(CONST_NULL); // useOnScopes
				constant!(if content.context_arg {
					CONST_TRUE
				} else {
					CONST_FALSE
				});
			}
		}
		let _ = logical;
		Payload::Arr(pairs)
	}

	/// Object-literal / Props-statics key: numeric-folded, else the full string machinery
	/// (interning + dedup — keys share roots with equal value strings).
	fn write_key(
		&mut self,
		key: &str,
		current_root: usize,
		path: &mut Vec<usize>,
		logical: usize,
	) -> (u8, Payload) {
		if is_foldable_numeric_key(key) {
			return (TYPE_PLAIN, Payload::Num(key.parse::<f64>().unwrap()));
		}
		path.push(logical);
		let pair = self.write(
			&Rc::new(SerdesValue::String(key.to_string())),
			current_root,
			path,
		);
		path.pop();
		pair
	}

	fn write_value_list(
		&mut self,
		values: &[Rc<SerdesValue>],
		current_root: usize,
		path: &mut Vec<usize>,
	) -> (u8, Payload) {
		let mut pairs = Vec::new();
		for (position, item) in values.iter().enumerate() {
			path.push(position);
			let pair = self.write(item, current_root, path);
			push_pair(&mut pairs, pair);
			path.pop();
		}
		(TYPE_ARRAY, Payload::Arr(pairs))
	}

	fn write_array(
		&mut self,
		items: &[Rc<SerdesValue>],
		current_root: usize,
		path: &mut Vec<usize>,
	) -> (u8, Payload) {
		// every emitted array drops trailing undefined elements
		let mut length = items.len();
		while length > 0 && matches!(*items[length - 1], SerdesValue::Undefined) {
			length -= 1;
		}
		let items = &items[..length];

		let big_array =
			items.len() > MAX_INLINE_ARRAY_ITEMS && items.iter().any(|item| is_flattenable(item));
		let mut pairs = Vec::with_capacity(items.len() * 2);
		for (position, item) in items.iter().enumerate() {
			if big_array && is_flattenable(item) {
				let key = root_key(item);
				let id = *self.index.entry(key).or_insert_with(|| {
					let id = self.roots.len();
					self.roots.push(PendingRoot::Value(Rc::clone(item)));
					id
				});
				push_pair(&mut pairs, (TYPE_ROOT_REF, Payload::Num(id as f64)));
				continue;
			}
			path.push(position);
			push_pair(&mut pairs, self.write(item, current_root, path));
			path.pop();
		}
		(
			if big_array {
				TYPE_BIG_ARRAY
			} else {
				TYPE_ARRAY
			},
			Payload::Arr(pairs),
		)
	}

	fn write_object(
		&mut self,
		entries: &[(String, Rc<SerdesValue>)],
		current_root: usize,
		path: &mut Vec<usize>,
	) -> (u8, Payload) {
		if entries.is_empty() {
			return (TYPE_OBJECT, Payload::Num(0.0));
		}
		let ordered = js_property_order(entries);
		let mut pairs = Vec::with_capacity(ordered.len() * 4);
		for (position, (object_key, object_value)) in ordered.iter().enumerate() {
			let key_pair = self.write_key(object_key, current_root, path, position * 2);
			push_pair(&mut pairs, key_pair);
			path.push(position * 2 + 1);
			push_pair(&mut pairs, self.write(object_value, current_root, path));
			path.pop();
		}
		(TYPE_OBJECT, Payload::Arr(pairs))
	}

	/// Emit the full `<script type="qwik/state" …>` sequence, chunking past 1024 roots.
	pub fn emit_state_scripts(self) -> String {
		let pairs = self.serialize();
		let root_count = pairs.len();
		let mut output = String::new();
		if root_count > MAX_STATE_ROOTS_PER_SCRIPT {
			// the JS emitter re-encodes chunk slices via JSON.parse → JSON.stringify
			let mut base = 0;
			while base < root_count {
				let end = (base + MAX_STATE_ROOTS_PER_SCRIPT).min(root_count);
				write_script(&mut output, base, end - base, &pairs[base..end], true);
				base = end;
			}
		} else {
			write_script(&mut output, 0, root_count, &pairs, false);
		}
		output
	}
}

fn write_number(number: f64) -> (u8, Payload) {
	if number.is_nan() {
		return (TYPE_CONSTANT, Payload::Num(CONST_NAN));
	}
	if number == f64::INFINITY {
		return (TYPE_CONSTANT, Payload::Num(CONST_INFINITY));
	}
	if number == f64::NEG_INFINITY {
		return (TYPE_CONSTANT, Payload::Num(CONST_NEG_INFINITY));
	}
	if number == MAX_SAFE_INTEGER {
		return (TYPE_CONSTANT, Payload::Num(CONST_MAX_SAFE_INT));
	}
	if number == MAX_SAFE_INTEGER - 1.0 {
		return (TYPE_CONSTANT, Payload::Num(CONST_ALMOST_MAX_SAFE_INT));
	}
	if number == -MAX_SAFE_INTEGER {
		return (TYPE_CONSTANT, Payload::Num(CONST_MIN_SAFE_INT));
	}
	(TYPE_PLAIN, Payload::Num(number))
}

fn is_foldable_numeric_key(key: &str) -> bool {
	if key.len() >= 8 {
		return false;
	}
	let digits = key.strip_prefix('-').unwrap_or(key);
	let mut bytes = digits.bytes();
	matches!(bytes.next(), Some(b'1'..=b'9')) && bytes.all(|byte| byte.is_ascii_digit())
}

/// Flattenable BigArray item: plain object or plain array (flyweights and backrefs excluded).
fn is_flattenable(value: &SerdesValue) -> bool {
	matches!(value, SerdesValue::Array(_) | SerdesValue::Object(_))
}

fn js_property_order(entries: &[(String, Rc<SerdesValue>)]) -> Vec<(&str, &Rc<SerdesValue>)> {
	let mut indexed: Vec<(u32, &str, &Rc<SerdesValue>)> = Vec::new();
	let mut named: Vec<(&str, &Rc<SerdesValue>)> = Vec::new();
	for (key, value) in entries {
		match array_index_of(key) {
			Some(array_index) => indexed.push((array_index, key, value)),
			None => named.push((key, value)),
		}
	}
	indexed.sort_by_key(|(array_index, _, _)| *array_index);
	indexed
		.into_iter()
		.map(|(_, key, value)| (key, value))
		.chain(named)
		.collect()
}

fn push_pair(pairs: &mut Vec<Payload>, (type_id, payload): (u8, Payload)) {
	pairs.push(Payload::Num(type_id as f64));
	pairs.push(payload);
}

fn write_script(
	output: &mut String,
	base: usize,
	len: usize,
	pairs: &[(u8, Payload)],
	reencode: bool,
) {
	let mut body = String::from("[");
	for (position, (type_id, payload)) in pairs.iter().enumerate() {
		if position > 0 {
			body.push(',');
		}
		body.push_str(&to_js_string(*type_id as f64));
		body.push(',');
		write_payload(payload, reencode, &mut body);
	}
	body.push(']');
	let body = body.replace("</", "<\\/");
	output.push_str(&format!(
		"<script type=\"qwik/state\" q:base=\"{base}\" q:len=\"{len}\">{body}</script>"
	));
}

fn write_payload(payload: &Payload, reencode: bool, output: &mut String) {
	match payload {
		Payload::Num(number) => output.push_str(&to_js_string(*number)),
		Payload::Str(text) => {
			if reencode {
				write_json_quoted(text, output);
			} else {
				write_fast_quoted(text, output);
			}
		}
		Payload::Arr(items) => {
			output.push('[');
			for (position, item) in items.iter().enumerate() {
				if position > 0 {
					output.push(',');
				}
				write_payload(item, reencode, output);
			}
			output.push(']');
		}
	}
}

/// Serializer fast path: raw quotes unless the string needs JSON escaping.
fn write_fast_quoted(text: &str, output: &mut String) {
	let needs_json = text
		.chars()
		.any(|ch| (ch as u32) < 32 || ch == '"' || ch == '\\');
	if needs_json {
		write_json_quoted(text, output);
	} else {
		output.push('"');
		output.push_str(text);
		output.push('"');
	}
}

fn write_json_quoted(text: &str, output: &mut String) {
	output.push('"');
	for ch in text.chars() {
		match ch {
			'"' => output.push_str("\\\""),
			'\\' => output.push_str("\\\\"),
			'\u{8}' => output.push_str("\\b"),
			'\u{c}' => output.push_str("\\f"),
			'\n' => output.push_str("\\n"),
			'\r' => output.push_str("\\r"),
			'\t' => output.push_str("\\t"),
			ch if (ch as u32) < 0x20 => output.push_str(&format!("\\u{:04x}", ch as u32)),
			ch => output.push(ch),
		}
	}
	output.push('"');
}

fn base64_no_pad(bytes: &[u8]) -> String {
	const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
	for chunk in bytes.chunks(3) {
		let buffer = [
			chunk[0],
			chunk.get(1).copied().unwrap_or(0),
			chunk.get(2).copied().unwrap_or(0),
		];
		let bits = ((buffer[0] as u32) << 16) | ((buffer[1] as u32) << 8) | buffer[2] as u32;
		output.push(ALPHABET[(bits >> 18) as usize & 63] as char);
		output.push(ALPHABET[(bits >> 12) as usize & 63] as char);
		if chunk.len() > 1 {
			output.push(ALPHABET[(bits >> 6) as usize & 63] as char);
		}
		if chunk.len() > 2 {
			output.push(ALPHABET[bits as usize & 63] as char);
		}
	}
	output
}
