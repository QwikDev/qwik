//! Render context and page assembly (specs/05). Mirrors `server/ssr-render.ts` +
//! `ssr-script-emitter.ts` + `ssr-events.ts`: one id counter per request, deferred event
//! attributes, state script → qwikloader → `_qwikEv` registration tail.

use crate::escape::escape_html;
use crate::number::to_js_string;
use crate::serdes::{
	BranchEffect, ComputedState, ContentEffect, EffectSubscription, EffectValue, ForBlockEffect,
	SerdesValue, Serializer, SignalState, TaskValue, EFFECT_KIND_ATTR, EFFECT_KIND_TEXT_EXPRESSION,
	EFFECT_KIND_TEXT_NODE, EFFECT_TARGET_ELEMENT, EFFECT_TARGET_ELEMENT_TEXT,
	EFFECT_TARGET_RANGE_TEXT,
};
use std::cell::RefCell;
use std::rc::Rc;

pub struct ContainerOptions {
	pub tag: String,
	pub version: String,
	pub render_mode: String,
	pub base: String,
	pub locale: String,
	pub manifest_hash: String,
	pub instance_hash: String,
}

pub struct PageOptions {
	pub container: ContainerOptions,
	/// Exact minified qwikloader bytes (the JS engine embeds `dist/qwikloader.js`).
	pub qwik_loader: String,
	/// Out-of-order streaming (`renderToStream`) — suspense boundaries defer to packets.
	pub streaming: bool,
	/// Production chunk mapping (manifest `mapping`): symbol → bundle file.
	pub chunk_map: Option<std::collections::HashMap<String, String>>,
}

/// `emitSuspenseRuntime` — the `_qwikS` client blob, byte-for-byte.
fn suspense_runtime(instance_hash: &str) -> String {
	format!("((w)=>{{w._qwikS=(s,i,u,o)=>w._qwikSP=Promise.resolve(w._qwikSP).then(async()=>{{const t=s.previousElementSibling,c=t.closest('[q\\\\:container]'),x=c&&c._ctx,z=n=>{{let p=n.parentElement;while(p&&!p.hasAttribute('q:container'))p=p.parentElement;return p===c}},h=async(r,m)=>{{if(r<0)return;const e=[...c.querySelectorAll('script[type=\"qwik/state\"]')].filter(z);for(let j=0;j<e.length;j++){{const b=+e[j].getAttribute('q:base'),l=+e[j].getAttribute('q:len');if(r>=b&&r<b+l){{const q=e[j].getAttribute('q:dispose');e[j].setAttribute('q:dispose',q?q+' '+r:''+r);break}}}}if(x)m?x.discardRoot(r):await x.disposeRoot(r)}},e=[...c.querySelectorAll('script[type=\"qwik/state\"][q\\\\:s=\"'+i+'\"]')].filter(z);if(x)x.registerStateScripts(e);await h(o,0);const k=document.createTreeWalker(c,128);let a,n,d=0;while(n=k.nextNode()){{if(!z(n))continue;const v=n.data;if(!a){{if(v==='d='+i)a=n}}else if(v.startsWith('d='))d++;else if(v==='/d'){{if(d)d--;else break}}}}if(!a||!n){{await h(u,1);t.remove();s.remove();return}}const r=document.createRange();r.setStartAfter(a);r.setEndBefore(n);r.deleteContents();r.insertNode(t.content);if(x&&u>=0)await x.prepareRoot(u);t.remove();s.remove()}});(w._qwikEv||(w._qwikEv=[])).push(0,\"{instance_hash}\")}})(window)")
}

pub struct SsrContext {
	pub serializer: Serializer,
	next_id: u32,
	/// Scoped event names in registration order (`e:click`, …).
	event_names: Vec<String>,
	/// Owner collectors: every effect created while a collector is open is appended to it
	/// (branch ownerItems, per-row effect arrays).
	owner_stack: Vec<Vec<Rc<SerdesValue>>>,
	/// Out-of-order streaming mode (`renderToStream`); suspense boundaries defer.
	pub streaming: bool,
	deferred: Vec<DeferredBoundary>,
	/// Registered styles in first-use order (`useStyles$`), deduped by style id.
	styles: Vec<(String, String)>,
	/// Active context scopes, innermost last.
	context_stack: Vec<Rc<SerdesValue>>,
}

/// A deferred suspense boundary awaiting its post-shell template packet.
struct DeferredBoundary {
	boundary_id: u32,
	content: String,
	content_root: usize,
	fallback_root: i64,
}

impl Default for SsrContext {
	fn default() -> Self {
		Self::new()
	}
}

impl SsrContext {
	pub fn new() -> Self {
		Self {
			serializer: Serializer::new(),
			next_id: 0,
			event_names: Vec::new(),
			owner_stack: Vec::new(),
			streaming: false,
			deferred: Vec::new(),
			styles: Vec::new(),
			context_stack: Vec::new(),
		}
	}

	pub fn push_context(&mut self, scope: Rc<SerdesValue>) {
		self.context_stack.push(scope);
	}

	pub fn pop_context(&mut self) {
		self.context_stack.pop();
	}

	pub fn current_context(&self) -> Option<Rc<SerdesValue>> {
		self.context_stack.last().cloned()
	}

	/// `useContext` — innermost scope providing the name wins.
	pub fn read_context(&self, name: &str) -> Rc<SerdesValue> {
		for scope in self.context_stack.iter().rev() {
			let SerdesValue::ContextScope(state) = &**scope else {
				continue;
			};
			if let Some((_, value)) = state.borrow().entries.iter().find(|(key, _)| key == name) {
				return Rc::clone(value);
			}
		}
		panic!("context {name:?} not provided");
	}

	pub fn register_style(&mut self, style_id: &str, css: &str) {
		if !self.styles.iter().any(|(id, _)| id == style_id) {
			self.styles.push((style_id.to_string(), css.to_string()));
		}
	}

	pub fn next_id(&mut self) -> u32 {
		let id = self.next_id;
		self.next_id += 1;
		id
	}

	/// ` q-e:click="mock-chunk#_run#N"` — a non-`_` symbol with captures is wrapped in `_run`;
	/// the wrapper's single capture is the original QRL, whose root id lands in the attribute.
	pub fn event_attr(&mut self, attr_name: &str, qrl: Rc<SerdesValue>) -> String {
		let scoped = attr_name
			.strip_prefix("q-")
			.unwrap_or(attr_name)
			.to_string();
		if !self.event_names.contains(&scoped) {
			self.event_names.push(scoped);
		}
		let SerdesValue::Qrl(qrl_value) = &*qrl else {
			panic!("event_attr expects a Qrl value");
		};
		let resolve_chunk = |map: &Option<std::collections::HashMap<String, String>>,
		                     symbol: &str,
		                     fallback: &str|
		 -> String {
			match map {
				Some(map) => map
					.get(symbol)
					.cloned()
					.unwrap_or_else(|| fallback.to_string()),
				None => fallback.to_string(),
			}
		};
		let run_chunk = resolve_chunk(&self.serializer.chunk_map, "_run", "mock-chunk");
		let own_chunk = resolve_chunk(
			&self.serializer.chunk_map,
			&qrl_value.symbol,
			&qrl_value.chunk,
		);
		let value = if !qrl_value.symbol.starts_with('_') && !qrl_value.captures.is_empty() {
			let root_id = self.serializer.add_root(Rc::clone(&qrl));
			format!("{run_chunk}#_run#{root_id}")
		} else if qrl_value.captures.is_empty() {
			format!("{}#{}", own_chunk, qrl_value.symbol)
		} else {
			// `_`-symbol QRLs (e.g. _val/_chk) inline capture deltas, previous seeded at 0
			let mut deltas = String::new();
			let mut previous = 0i64;
			for (position, capture) in qrl_value.captures.iter().enumerate() {
				let capture_id = self.serializer.add_root(Rc::clone(capture)) as i64;
				if position > 0 {
					deltas.push(' ');
				}
				deltas.push_str(&(capture_id - previous).to_string());
				previous = capture_id;
			}
			format!("{}#{}#{deltas}", own_chunk, qrl_value.symbol)
		};
		format!(" {attr_name}=\"{}\"", escape_html(&value))
	}

	/// TextNode effect subscription on an element-text target (`renderSsrTextNode`).
	pub fn subscribe_element_text(&mut self, signal: &Rc<SerdesValue>, target_id: u32) {
		self.attach_effect(
			&[Rc::clone(signal)],
			EffectValue::Scalar(EffectSubscription {
				kind: EFFECT_KIND_TEXT_NODE,
				target_kind: EFFECT_TARGET_ELEMENT_TEXT,
				target_id,
				marker_index: None,
				deps: vec![Rc::clone(signal)],
				attr_name: None,
				args: None,
				qrl: None,
			}),
		);
	}

	/// TextNode effect subscription on a range-text target (`<!t>` fenced).
	pub fn subscribe_range_text(&mut self, signal: &Rc<SerdesValue>, target_id: u32, marker: u32) {
		self.attach_effect(
			&[Rc::clone(signal)],
			EffectValue::Scalar(EffectSubscription {
				kind: EFFECT_KIND_TEXT_NODE,
				target_kind: EFFECT_TARGET_RANGE_TEXT,
				target_id,
				marker_index: Some(marker),
				deps: vec![Rc::clone(signal)],
				attr_name: None,
				args: None,
				qrl: None,
			}),
		);
	}

	/// TextExpression effect (`renderSsrTextExpression`): args are the segment captures the
	/// browser passes to the resume QRL; deps are the signals read during server evaluation.
	pub fn subscribe_text_expression(
		&mut self,
		deps: &[Rc<SerdesValue>],
		target_id: u32,
		marker: u32,
		args: Vec<Rc<SerdesValue>>,
		qrl: Rc<SerdesValue>,
	) {
		self.attach_effect(
			deps,
			EffectValue::Scalar(EffectSubscription {
				kind: EFFECT_KIND_TEXT_EXPRESSION,
				target_kind: EFFECT_TARGET_RANGE_TEXT,
				target_id,
				marker_index: Some(marker),
				deps: deps.to_vec(),
				attr_name: None,
				args: Some(args),
				qrl: Some(qrl),
			}),
		);
	}

	/// TextExpression effect on an element-text target (single expression child, no markers).
	pub fn subscribe_element_text_expression(
		&mut self,
		deps: &[Rc<SerdesValue>],
		target_id: u32,
		args: Vec<Rc<SerdesValue>>,
		qrl: Rc<SerdesValue>,
	) {
		self.attach_effect(
			deps,
			EffectValue::Scalar(EffectSubscription {
				kind: EFFECT_KIND_TEXT_EXPRESSION,
				target_kind: EFFECT_TARGET_ELEMENT_TEXT,
				target_id,
				marker_index: None,
				deps: deps.to_vec(),
				attr_name: None,
				args: Some(args),
				qrl: Some(qrl),
			}),
		);
	}

	/// Attr-expression effect (`renderSsrAttrExpression`): resume args + qrl ride the record.
	#[allow(clippy::too_many_arguments)]
	pub fn subscribe_attr_expression(
		&mut self,
		deps: &[Rc<SerdesValue>],
		target_id: u32,
		name: &str,
		args: Vec<Rc<SerdesValue>>,
		qrl: Rc<SerdesValue>,
	) {
		self.attach_effect(
			deps,
			EffectValue::Scalar(EffectSubscription {
				kind: EFFECT_KIND_ATTR,
				target_kind: EFFECT_TARGET_ELEMENT,
				target_id,
				marker_index: None,
				deps: deps.to_vec(),
				attr_name: Some(name.to_string()),
				args: Some(args),
				qrl: Some(qrl),
			}),
		);
	}

	/// Plain Attr effect (`renderSsrAttr`) — reactive attribute on an element target.
	pub fn subscribe_attr(&mut self, signal: &Rc<SerdesValue>, target_id: u32, name: &str) {
		self.attach_effect(
			&[Rc::clone(signal)],
			EffectValue::Scalar(EffectSubscription {
				kind: EFFECT_KIND_ATTR,
				target_kind: EFFECT_TARGET_ELEMENT,
				target_id,
				marker_index: None,
				deps: vec![Rc::clone(signal)],
				attr_name: Some(name.to_string()),
				args: None,
				qrl: None,
			}),
		);
	}

	/// `useOn`-style attr (`q-e:qvisible`) — the `_visibleTask` wrapper points at the Task root.
	pub fn use_on_attr(&mut self, attr_name: &str, task: Rc<SerdesValue>) -> String {
		let scoped = attr_name
			.strip_prefix("q-")
			.unwrap_or(attr_name)
			.to_string();
		if !self.event_names.contains(&scoped) {
			self.event_names.push(scoped);
		}
		let root_id = self.serializer.add_root(task);
		format!(" {attr_name}=\"mock-chunk#_visibleTask#{root_id}\"")
	}

	/// Wrap, append to the open owner collector, and register on each dep's subscriber list.
	fn attach_effect(&mut self, deps: &[Rc<SerdesValue>], effect: EffectValue) -> Rc<SerdesValue> {
		let effect = Rc::new(SerdesValue::Effect(RefCell::new(effect)));
		if let Some(top) = self.owner_stack.last_mut() {
			top.push(Rc::clone(&effect));
		}
		for dep in deps {
			push_subscription(dep, Rc::clone(&effect));
		}
		effect
	}

	pub fn push_owner(&mut self) {
		self.owner_stack.push(Vec::new());
	}

	pub fn pop_owner(&mut self) -> Vec<Rc<SerdesValue>> {
		self.owner_stack.pop().expect("owner stack underflow")
	}

	/// Append a non-effect owner item (e.g. the per-row effect arrays of a For block).
	pub fn push_owner_item(&mut self, item: Rc<SerdesValue>) {
		if let Some(top) = self.owner_stack.last_mut() {
			top.push(item);
		}
	}

	/// A component call materializes its own lazily-created owner (`createComponent`).
	pub fn push_component_owner(&mut self) {
		self.push_owner();
	}

	/// Collapse the call's owner into one item of the enclosing collector; single items stay
	/// unwrapped, mirroring the runtime `Owner.items` single-vs-array shape.
	pub fn pop_component_owner(&mut self) {
		let mut items = self.pop_owner();
		match items.len() {
			0 => {}
			1 => self.push_owner_item(items.pop().expect("single owner item")),
			_ => self.push_owner_item(Rc::new(SerdesValue::Array(items))),
		}
	}

	/// Branch effect, registered before its arm renders so subscriber order matches the JS
	/// engine; owner items stream into it while the arm renders.
	pub fn create_branch_effect(
		&mut self,
		range_id: u32,
		current_branch: u32,
		deps: Vec<Rc<SerdesValue>>,
		condition_qrl: Rc<SerdesValue>,
		then_qrl: Rc<SerdesValue>,
		else_qrl: Option<Rc<SerdesValue>>,
	) -> Rc<SerdesValue> {
		let dep_list = deps.clone();
		self.attach_effect(
			&dep_list,
			EffectValue::Branch(BranchEffect {
				range_id,
				current_branch,
				deps,
				condition_qrl,
				then_qrl,
				else_qrl,
				owner_items: Vec::new(),
				id_base: String::new(),
			}),
		)
	}

	pub fn set_branch_owner_items(effect: &Rc<SerdesValue>, items: Vec<Rc<SerdesValue>>) {
		let SerdesValue::Effect(cell) = &**effect else {
			panic!("set_branch_owner_items expects an effect");
		};
		let EffectValue::Branch(branch) = &mut *cell.borrow_mut() else {
			panic!("set_branch_owner_items expects a branch effect");
		};
		branch.owner_items = items;
	}

	pub fn create_for_effect(
		&mut self,
		range_id: u32,
		deps: Vec<Rc<SerdesValue>>,
		key_qrl: Rc<SerdesValue>,
		render_qrl: Rc<SerdesValue>,
		uses_index_signal: bool,
		row_shape: u8,
	) -> Rc<SerdesValue> {
		let dep_list = deps.clone();
		self.attach_effect(
			&dep_list,
			EffectValue::ForBlock(ForBlockEffect {
				range_id,
				deps,
				key_qrl,
				render_qrl,
				uses_index_signal,
				index_signals: if uses_index_signal {
					Some(Vec::new())
				} else {
					None
				},
				id_base: String::new(),
				row_shape,
			}),
		)
	}

	pub fn add_index_signal(effect: &Rc<SerdesValue>, signal: Rc<SerdesValue>) {
		let SerdesValue::Effect(cell) = &**effect else {
			panic!("add_index_signal expects an effect");
		};
		let EffectValue::ForBlock(for_block) = &mut *cell.borrow_mut() else {
			panic!("add_index_signal expects a for-block effect");
		};
		for_block
			.index_signals
			.as_mut()
			.expect("index signals unused on this for block")
			.push(signal);
	}

	pub fn create_content_effect(
		&mut self,
		range_id: u32,
		deps: Vec<Rc<SerdesValue>>,
		args: Vec<Rc<SerdesValue>>,
		qrl: Rc<SerdesValue>,
		context_arg: bool,
	) -> Rc<SerdesValue> {
		let dep_list = deps.clone();
		self.attach_effect(
			&dep_list,
			EffectValue::Content(ContentEffect {
				range_id,
				deps,
				args,
				qrl,
				context_arg,
			}),
		)
	}

	/// Suspense boundary: content renders eagerly; streaming wraps the fallback in nested
	/// ranges and queues a template packet, in-order emits the content inline.
	#[allow(clippy::too_many_arguments)]
	pub fn suspense(
		&mut self,
		out: &mut String,
		content_range: u32,
		content: String,
		content_qrl: Rc<SerdesValue>,
		fallback_qrl: Option<Rc<SerdesValue>>,
		render_fallback: impl FnOnce(&mut Self, &mut String),
	) {
		let content_effect =
			self.create_content_effect(content_range, Vec::new(), Vec::new(), content_qrl, true);
		let content_root = self.serializer.add_root(content_effect);
		if !self.streaming {
			out.push_str(&format!("<!d={content_range}>"));
			out.push_str(&content);
			out.push_str("<!/d>");
			return;
		}
		let boundary_id = self.deferred.len() as u32;
		let mut fallback_root = -1i64;
		let mut fallback_output = String::new();
		if let Some(fallback_qrl) = fallback_qrl {
			let fallback_range = self.next_id();
			render_fallback(self, &mut fallback_output);
			let fallback_effect = self.create_content_effect(
				fallback_range,
				Vec::new(),
				Vec::new(),
				fallback_qrl,
				true,
			);
			fallback_root = self.serializer.add_root(fallback_effect) as i64;
			fallback_output = format!("<!d={fallback_range}>{fallback_output}<!/d>");
		}
		out.push_str(&format!("<!d={content_range}>"));
		out.push_str(&fallback_output);
		out.push_str("<!/d>");
		self.deferred.push(DeferredBoundary {
			boundary_id,
			content,
			content_root,
			fallback_root,
		});
	}

	/// Run a task body during setup: tracked reads become deps, the Task subscribes to them.
	pub fn run_task(
		&mut self,
		phase: u8,
		qrl: Rc<SerdesValue>,
		body: impl FnOnce(&mut Vec<Rc<SerdesValue>>),
	) -> Rc<SerdesValue> {
		let mut tracked = Vec::new();
		body(&mut tracked);
		let task = Rc::new(SerdesValue::Task(TaskValue {
			phase,
			qrl,
			deps: tracked.clone(),
		}));
		for dep in &tracked {
			push_subscription(dep, Rc::clone(&task));
		}
		self.serializer.add_root(Rc::clone(&task));
		task
	}
}

/// Lazily evaluate a computed on first read: cache the value, subscribe to tracked deps.
pub fn computed_read(
	computed: &Rc<SerdesValue>,
	evaluate: impl FnOnce(&mut Vec<Rc<SerdesValue>>) -> Rc<SerdesValue>,
) -> Rc<SerdesValue> {
	let SerdesValue::Computed(state) = &**computed else {
		panic!("computed_read expects a Computed value");
	};
	if let Some(cached) = &state.borrow().value {
		return Rc::clone(cached);
	}
	let mut tracked = Vec::new();
	let value = evaluate(&mut tracked);
	state.borrow_mut().value = Some(Rc::clone(&value));
	state.borrow_mut().deps = tracked.clone();
	for dep in &tracked {
		push_subscription(dep, Rc::clone(computed));
	}
	value
}

/// Value-segment fn: `(tracked, captures) -> value` (specs/07 invocation convention).
pub type ValueSegmentFn = fn(&mut Vec<Rc<SerdesValue>>, &[Rc<SerdesValue>]) -> Rc<SerdesValue>;

/// One-shot computed read through its value-segment fn (specs/07 invocation convention):
/// the computed's own QRL supplies the captures the body evaluates with.
pub fn computed_read_with(computed: &Rc<SerdesValue>, body: ValueSegmentFn) -> Rc<SerdesValue> {
	let captures = {
		let SerdesValue::Computed(state) = &**computed else {
			panic!("computed_read_with expects a Computed value");
		};
		qrl_captures(&state.borrow().qrl).to_vec()
	};
	computed_read(computed, |tracked| body(tracked, &captures))
}

/// Signal write (`signal.value = x`) — task bodies mutate during SSR.
pub fn set_signal_value(signal: &Rc<SerdesValue>, value: Rc<SerdesValue>) {
	let SerdesValue::Signal(state) = &**signal else {
		panic!("set_signal_value expects a Signal value");
	};
	state.borrow_mut().value = value;
}

/// Create a signal (index signals and generated setup share this shape).
pub fn new_signal(value: Rc<SerdesValue>) -> Rc<SerdesValue> {
	Rc::new(SerdesValue::Signal(RefCell::new(SignalState {
		value,
		subs: Vec::new(),
	})))
}

/// Create an unevaluated computed.
pub fn new_computed(qrl: Rc<SerdesValue>) -> Rc<SerdesValue> {
	Rc::new(SerdesValue::Computed(RefCell::new(ComputedState {
		qrl,
		deps: Vec::new(),
		value: None,
		subs: Vec::new(),
	})))
}

/// Tracked array read of a reactive collection source — clones the item list for iteration.
pub fn tracked_array_items(
	source: &Rc<SerdesValue>,
	tracked: &mut Vec<Rc<SerdesValue>>,
) -> Vec<Rc<SerdesValue>> {
	let value = tracked_signal_value(source, tracked);
	let SerdesValue::Array(items) = &*value else {
		panic!("collection source is not an array");
	};
	items.clone()
}

/// JS strict equality on primitives.
pub fn js_strict_eq(left: &Rc<SerdesValue>, right: &Rc<SerdesValue>) -> Rc<SerdesValue> {
	let equal = match (&**left, &**right) {
		(SerdesValue::Number(a), SerdesValue::Number(b)) => a == b,
		(SerdesValue::String(a), SerdesValue::String(b)) => a == b,
		(SerdesValue::Bool(a), SerdesValue::Bool(b)) => a == b,
		(SerdesValue::Null, SerdesValue::Null) => true,
		(SerdesValue::Undefined, SerdesValue::Undefined) => true,
		_ => Rc::ptr_eq(left, right),
	};
	Rc::new(SerdesValue::Bool(equal))
}

/// JS `==` on primitives; comparisons that would invoke ToPrimitive on objects panic.
pub fn js_loose_eq(left: &Rc<SerdesValue>, right: &Rc<SerdesValue>) -> Rc<SerdesValue> {
	Rc::new(SerdesValue::Bool(loose_eq_value(left, right)))
}

fn loose_eq_value(left: &Rc<SerdesValue>, right: &Rc<SerdesValue>) -> bool {
	match (&**left, &**right) {
		(SerdesValue::Number(a), SerdesValue::Number(b)) => a == b,
		(SerdesValue::String(a), SerdesValue::String(b)) => a == b,
		(SerdesValue::Bool(a), SerdesValue::Bool(b)) => a == b,
		(
			SerdesValue::Null | SerdesValue::Undefined,
			SerdesValue::Null | SerdesValue::Undefined,
		) => true,
		(SerdesValue::Null | SerdesValue::Undefined, _)
		| (_, SerdesValue::Null | SerdesValue::Undefined) => false,
		(SerdesValue::Number(a), SerdesValue::String(b)) => *a == js_string_to_number(b),
		(SerdesValue::String(a), SerdesValue::Number(b)) => js_string_to_number(a) == *b,
		(SerdesValue::Bool(a), _) => {
			loose_eq_value(&Rc::new(SerdesValue::Number(f64::from(*a))), right)
		}
		(_, SerdesValue::Bool(b)) => {
			loose_eq_value(left, &Rc::new(SerdesValue::Number(f64::from(*b))))
		}
		(a, b) => panic!("loose equality of {a:?} and {b:?} not supported yet"),
	}
}

/// JS ToNumber on strings: trimmed empty is 0, otherwise a float parse (NaN on failure).
fn js_string_to_number(text: &str) -> f64 {
	let trimmed = text.trim();
	if trimmed.is_empty() {
		return 0.0;
	}
	trimmed.parse::<f64>().unwrap_or(f64::NAN)
}

/// JS `*` on numbers.
pub fn js_mul(left: &Rc<SerdesValue>, right: &Rc<SerdesValue>) -> Rc<SerdesValue> {
	match (&**left, &**right) {
		(SerdesValue::Number(a), SerdesValue::Number(b)) => Rc::new(SerdesValue::Number(a * b)),
		(a, b) => panic!("js_mul of {a:?} and {b:?} not supported yet"),
	}
}

/// JS `>` on numbers.
pub fn js_gt(left: &Rc<SerdesValue>, right: &Rc<SerdesValue>) -> Rc<SerdesValue> {
	match (&**left, &**right) {
		(SerdesValue::Number(a), SerdesValue::Number(b)) => Rc::new(SerdesValue::Bool(a > b)),
		(a, b) => panic!("js_gt of {a:?} and {b:?} not supported yet"),
	}
}

/// JS unary `-`.
pub fn js_negate(value: &Rc<SerdesValue>) -> Rc<SerdesValue> {
	match &**value {
		SerdesValue::Number(number) => Rc::new(SerdesValue::Number(-number)),
		SerdesValue::String(text) => Rc::new(SerdesValue::Number(-js_string_to_number(text))),
		other => panic!("js_negate of {other:?} not supported yet"),
	}
}

/// JS `!`.
pub fn js_not(value: &Rc<SerdesValue>) -> Rc<SerdesValue> {
	Rc::new(SerdesValue::Bool(!truthy(value)))
}

/// JS `typeof`.
pub fn js_typeof(value: &Rc<SerdesValue>) -> Rc<SerdesValue> {
	let name = match &**value {
		SerdesValue::Undefined => "undefined",
		SerdesValue::Bool(_) => "boolean",
		SerdesValue::Number(_) => "number",
		SerdesValue::String(_) => "string",
		SerdesValue::BigInt(_) => "bigint",
		SerdesValue::Qrl(_) => "function",
		// null included: `typeof null === 'object'`
		_ => "object",
	};
	Rc::new(SerdesValue::String(name.to_string()))
}

/// Computed index read: array by numeric index, anything else by its string key.
pub fn index_read(
	object: &Rc<SerdesValue>,
	index: &Rc<SerdesValue>,
	tracked: &mut Vec<Rc<SerdesValue>>,
) -> Rc<SerdesValue> {
	if let (SerdesValue::Array(items), SerdesValue::Number(position)) = (&**object, &**index) {
		// a non-integral or out-of-range index is `undefined`, as in JS
		if position.fract() != 0.0 || *position < 0.0 {
			return Rc::new(SerdesValue::Undefined);
		}
		return match items.get(*position as usize) {
			Some(item) => Rc::clone(item),
			None => Rc::new(SerdesValue::Undefined),
		};
	}
	member_read(object, &value_text(index), tracked)
}

/// Items of an evaluated array value (derived collection iteration).
pub fn array_items(value: &Rc<SerdesValue>) -> Vec<Rc<SerdesValue>> {
	let SerdesValue::Array(items) = &**value else {
		panic!("array_items on a non-array {value:?}");
	};
	items.clone()
}

/// JS truthiness.
pub fn truthy(value: &Rc<SerdesValue>) -> bool {
	match &**value {
		SerdesValue::Undefined | SerdesValue::Null | SerdesValue::Bool(false) => false,
		SerdesValue::Number(number) => *number != 0.0 && !number.is_nan(),
		SerdesValue::String(text) => !text.is_empty(),
		SerdesValue::Bool(true) => true,
		_ => true,
	}
}

/// Value-based member read for evaluated objects (`.length` on strings/arrays, plain lookups).
pub fn value_member(object: &Rc<SerdesValue>, name: &str) -> Rc<SerdesValue> {
	match (&**object, name) {
		(SerdesValue::Array(items), "length") => Rc::new(SerdesValue::Number(items.len() as f64)),
		(SerdesValue::String(text), "length") => {
			Rc::new(SerdesValue::Number(text.encode_utf16().count() as f64))
		}
		(SerdesValue::Object(entries), _) => match entries.iter().find(|(key, _)| key == name) {
			Some((_, item)) => Rc::clone(item),
			None => Rc::new(SerdesValue::Undefined),
		},
		(other, _) => panic!("value_member {name:?} on {other:?} not supported yet"),
	}
}

/// Content-effect output escaping (`escapeSsrContent`): string/number/bigint escape, else `''`.
pub fn escape_ssr_content(value: &Rc<SerdesValue>) -> String {
	match &**value {
		SerdesValue::String(text) => escape_html(text),
		SerdesValue::Number(number) => escape_html(&to_js_string(*number)),
		SerdesValue::BigInt(digits) => escape_html(digits),
		_ => String::new(),
	}
}

/// `serializeClass` (styles.ts): strings trim, arrays recurse, objects keep truthy keys.
pub fn serialize_class(value: &Rc<SerdesValue>) -> String {
	match &**value {
		SerdesValue::Undefined | SerdesValue::Null | SerdesValue::Bool(false) => String::new(),
		SerdesValue::String(text) => text.trim().to_string(),
		SerdesValue::Array(items) => {
			let mut classes: Vec<String> = Vec::new();
			for item in items {
				let class_list = serialize_class(item);
				if !class_list.is_empty() {
					classes.push(class_list);
				}
			}
			classes.join(" ")
		}
		SerdesValue::Object(entries) => {
			let mut classes: Vec<String> = Vec::new();
			for (key, item) in entries {
				if truthy(item) {
					classes.push(key.trim().to_string());
				}
			}
			classes.join(" ")
		}
		other => panic!("serialize_class on {other:?} not supported yet"),
	}
}

/// Expression-attr result → attribute text: `class` objects serialize, plain values coerce.
/// Empty `class`/`style` results omit the attribute entirely, like the JS serializer.
pub fn attr_expression_text(name: &str, value: &Rc<SerdesValue>) -> Option<String> {
	if name == "class" {
		let text = serialize_class(value);
		return if text.is_empty() { None } else { Some(text) };
	}
	let text = match &**value {
		SerdesValue::Null | SerdesValue::Undefined => return None,
		other => value_text(other),
	};
	if text.is_empty() && (name == "class" || name == "style") {
		return None;
	}
	Some(text)
}

/// Dynamic attribute serialization: null/undefined → omitted, `''` → bare, else escaped value.
pub fn dynamic_attr(signal: &Rc<SerdesValue>, name: &str) -> String {
	let value = signal_value(signal);
	match &*value {
		SerdesValue::Null | SerdesValue::Undefined => String::new(),
		SerdesValue::String(text) if text.is_empty() => format!(" {name}"),
		other => format!(" {name}=\"{}\"", escape_html(&value_text(other))),
	}
}

fn push_subscription(dep: &Rc<SerdesValue>, subscriber: Rc<SerdesValue>) {
	match &**dep {
		SerdesValue::Signal(state) => state.borrow_mut().subs.push(subscriber),
		SerdesValue::Computed(state) => state.borrow_mut().subs.push(subscriber),
		SerdesValue::StoreProp { store, prop } => {
			let SerdesValue::Store(state) = &**store else {
				panic!("StoreProp must reference a Store");
			};
			let mut state = state.borrow_mut();
			if let Some(record) = state.records.iter_mut().find(|record| record.prop == *prop) {
				record.subs.push(subscriber);
			} else {
				state.records.push(crate::serdes::StoreRecord {
					prop: prop.clone(),
					subs: vec![subscriber],
				});
			}
		}
		other => panic!("subscription dep {other:?} not supported"),
	}
}

/// SSR text interpolation of a signal's current value (`value == null ? '' : String(value)`).
pub fn signal_text(signal: &Rc<SerdesValue>) -> String {
	value_text(&signal_value(signal))
}

/// Current value of a signal (`.value` read).
pub fn signal_value(signal: &Rc<SerdesValue>) -> Rc<SerdesValue> {
	let SerdesValue::Signal(state) = &**signal else {
		panic!("signal_value expects a Signal value");
	};
	Rc::clone(&state.borrow().value)
}

/// SSR text interpolation (`value == null ? '' : String(value)`).
/// Text-node output (`serializeSsrTextValue`): empty text becomes a space, so the node exists in
/// the DOM for the client to resume into.
pub fn ssr_text_value(value: &SerdesValue) -> String {
	let text = value_text(value);
	if text.is_empty() {
		" ".to_string()
	} else {
		text
	}
}

pub fn value_text(value: &SerdesValue) -> String {
	match value {
		SerdesValue::Undefined | SerdesValue::Null => String::new(),
		SerdesValue::Bool(true) => "true".to_string(),
		SerdesValue::Bool(false) => "false".to_string(),
		SerdesValue::Number(number) => to_js_string(*number),
		SerdesValue::String(text) => text.clone(),
		other => panic!("text interpolation of {other:?} not supported yet"),
	}
}

/// Tracked member read: props sources and store props record their tracked dep (auto-track);
/// statics and plain objects read untracked. Missing keys read `undefined`.
/// Captures slice of a QRL value — the environment a QRL invocation runs with.
pub fn qrl_captures(qrl: &Rc<SerdesValue>) -> &[Rc<SerdesValue>] {
	match &**qrl {
		SerdesValue::Qrl(value) => &value.captures,
		other => panic!("qrl_captures expects a Qrl, got {other:?}"),
	}
}

/// A destructured component chunk replays the full `const { … } = props` pattern before its
/// expression, so every source is a tracked read at each evaluation. No-op for plain objects.
pub fn track_props_sources(props: &Rc<SerdesValue>, tracked: &mut Vec<Rc<SerdesValue>>) {
	if let SerdesValue::Props(value) = &**props {
		for (_, source) in &value.sources {
			match &**source {
				SerdesValue::Signal(_) => tracked.push(Rc::clone(source)),
				other => panic!("track_props_sources source {other:?} not supported yet"),
			}
		}
	}
}

/// `mergeProps` — ordered object merge: later values win, first insertion keeps its position.
pub fn merge_props(sources: &[Rc<SerdesValue>]) -> Rc<SerdesValue> {
	let mut entries: Vec<(String, Rc<SerdesValue>)> = Vec::new();
	for source in sources {
		let SerdesValue::Object(source_entries) = &**source else {
			panic!("merge_props expects plain objects, got {source:?}");
		};
		for (key, value) in source_entries {
			match entries.iter_mut().find(|(existing, _)| existing == key) {
				Some((_, slot)) => *slot = Rc::clone(value),
				None => entries.push((key.clone(), Rc::clone(value))),
			}
		}
	}
	Rc::new(SerdesValue::Object(entries))
}

/// `_props(merged, sources)` over a merged object: statics are the merged entries minus the
/// source keys (the getters live in `sources` on the wire).
pub fn props_from(
	merged: &Rc<SerdesValue>,
	sources: Vec<(String, Rc<SerdesValue>)>,
) -> Rc<SerdesValue> {
	let SerdesValue::Object(entries) = &**merged else {
		panic!("props_from expects a plain object, got {merged:?}");
	};
	let statics = entries
		.iter()
		.filter(|(key, _)| !sources.iter().any(|(source_key, _)| source_key == key))
		.cloned()
		.collect();
	Rc::new(SerdesValue::Props(crate::serdes::PropsValue {
		statics,
		sources,
	}))
}

/// Untracked prop read for component-parameter destructuring (`const { name } = props`).
pub fn props_value(props: &Rc<SerdesValue>, name: &str) -> Rc<SerdesValue> {
	match &**props {
		SerdesValue::Object(entries) => entries
			.iter()
			.find(|(key, _)| key == name)
			.map(|(_, item)| Rc::clone(item))
			.unwrap_or_else(|| Rc::new(SerdesValue::Undefined)),
		SerdesValue::Props(value) => {
			if let Some((_, item)) = value.statics.iter().find(|(key, _)| key == name) {
				return Rc::clone(item);
			}
			match value.sources.iter().find(|(key, _)| key == name) {
				// the destructure getter returns the source's current value (untracked)
				Some((_, source)) => match &**source {
					SerdesValue::Signal(state) => Rc::clone(&state.borrow().value),
					other => panic!("props_value source {other:?} not supported yet"),
				},
				None => Rc::new(SerdesValue::Undefined),
			}
		}
		other => panic!("props_value expects Object or Props, got {other:?}"),
	}
}

pub fn member_read(
	object: &Rc<SerdesValue>,
	name: &str,
	tracked: &mut Vec<Rc<SerdesValue>>,
) -> Rc<SerdesValue> {
	match &**object {
		SerdesValue::Signal(_) if name == "value" => tracked_signal_value(object, tracked),
		SerdesValue::Store(state) => {
			let handle = {
				let mut store_state = state.borrow_mut();
				match store_state.prop_handles.iter().find(|(key, _)| key == name) {
					Some((_, existing)) => Rc::clone(existing),
					None => {
						let created = Rc::new(SerdesValue::StoreProp {
							store: Rc::clone(object),
							prop: name.to_string(),
						});
						store_state
							.prop_handles
							.push((name.to_string(), Rc::clone(&created)));
						created
					}
				}
			};
			tracked.push(handle);
			let raw = Rc::clone(&state.borrow().raw);
			let SerdesValue::Object(entries) = &*raw else {
				panic!("store raw must be an object");
			};
			match entries.iter().find(|(key, _)| key == name) {
				Some((_, item)) => Rc::clone(item),
				None => Rc::new(SerdesValue::Undefined),
			}
		}
		SerdesValue::Props(value) => {
			if let Some((_, source)) = value.sources.iter().find(|(key, _)| key == name) {
				tracked.push(Rc::clone(source));
				return signal_value(source);
			}
			match value.statics.iter().find(|(key, _)| key == name) {
				Some((_, item)) => Rc::clone(item),
				None => Rc::new(SerdesValue::Undefined),
			}
		}
		SerdesValue::Object(entries) => match entries.iter().find(|(key, _)| key == name) {
			Some((_, item)) => Rc::clone(item),
			None => Rc::new(SerdesValue::Undefined),
		},
		// untracked value semantics cover the rest (lengths, panics on the unsupported)
		_ => value_member(object, name),
	}
}

/// Tracked signal `.value` read (auto-track).
pub fn tracked_signal_value(
	signal: &Rc<SerdesValue>,
	tracked: &mut Vec<Rc<SerdesValue>>,
) -> Rc<SerdesValue> {
	tracked.push(Rc::clone(signal));
	signal_value(signal)
}

/// One segment of a template literal: raw text or an interpolated value.
pub enum TemplatePart {
	Text(&'static str),
	Value(Rc<SerdesValue>),
}

/// Template literal interpolation: each hole goes through JS ToString.
pub fn js_template(parts: &[TemplatePart]) -> Rc<SerdesValue> {
	let mut output = String::new();
	for part in parts {
		match part {
			TemplatePart::Text(text) => output.push_str(text),
			TemplatePart::Value(value) => output.push_str(&js_string(value)),
		}
	}
	Rc::new(SerdesValue::String(output))
}

/// JS `+` (specs/06): string operand → concatenation, else numeric addition.
pub fn js_add(left: &Rc<SerdesValue>, right: &Rc<SerdesValue>) -> Rc<SerdesValue> {
	match (&**left, &**right) {
		(SerdesValue::Number(a), SerdesValue::Number(b)) => Rc::new(SerdesValue::Number(a + b)),
		(SerdesValue::String(_), _) | (_, SerdesValue::String(_)) => Rc::new(SerdesValue::String(
			format!("{}{}", js_string(left), js_string(right)),
		)),
		(a, b) => panic!("js_add of {a:?} and {b:?} not supported yet"),
	}
}

/// JS ToString for primitives (`String(value)`).
fn js_string(value: &SerdesValue) -> String {
	match value {
		SerdesValue::Undefined => "undefined".to_string(),
		SerdesValue::Null => "null".to_string(),
		_ => value_text(value),
	}
}

pub fn render_page(
	options: &PageOptions,
	root: impl FnOnce(&mut SsrContext, &mut String),
) -> String {
	let mut ctx = SsrContext::new();
	ctx.streaming = options.streaming;
	ctx.serializer.chunk_map = options.chunk_map.clone();
	let mut body = String::new();
	root(&mut ctx, &mut body);

	let container = &options.container;
	let mut output = String::new();
	output.push('<');
	output.push_str(&container.tag);
	for (name, value) in [
		("q:container", "paused"),
		("q:runtime", "2"),
		("q:version", container.version.as_str()),
		("q:render", container.render_mode.as_str()),
		("q:base", container.base.as_str()),
		("q:locale", container.locale.as_str()),
		("q:manifest-hash", container.manifest_hash.as_str()),
		("q:instance", container.instance_hash.as_str()),
	] {
		output.push(' ');
		output.push_str(name);
		output.push_str("=\"");
		output.push_str(&escape_html(value));
		output.push('"');
	}
	output.push('>');
	if ctx.styles.is_empty() {
		output.push_str(&body);
	} else {
		// styled output synthesizes head/body inside the container (createContainerTags)
		output.push_str("<head>");
		for (style_id, css) in &ctx.styles {
			output.push_str("<style q:style=\"");
			output.push_str(&escape_html(style_id));
			output.push_str("\">");
			// style content is NOT escaped; only the id is (specs/05)
			output.push_str(css);
			output.push_str("</style>");
		}
		output.push_str("</head><body>");
		output.push_str(&body);
		output.push_str("</body>");
	}

	let has_roots = ctx.serializer.root_count() > 0;
	let has_events = !ctx.event_names.is_empty();
	let has_deferred = !ctx.deferred.is_empty();
	if has_roots {
		output.push_str(&ctx.serializer.emit_state_scripts());
	}
	if has_events || has_deferred {
		output.push_str("<script id=\"qwikloader\" async type=\"module\">");
		output.push_str(&options.qwik_loader);
		output.push_str("</script>");
		if has_events {
			output.push_str("<script>(window._qwikEv||(window._qwikEv=[])).push(");
			for (position, event_name) in ctx.event_names.iter().enumerate() {
				if position > 0 {
					output.push(',');
				}
				output.push('"');
				output.push_str(event_name);
				output.push('"');
			}
			output.push_str(")</script>");
		}
	}
	if has_deferred {
		output.push_str("<script>");
		output.push_str(&suspense_runtime(&container.instance_hash));
		output.push_str("</script>");
		for boundary in &ctx.deferred {
			output.push_str(&format!(
				"<template q:s=\"{}\">{}</template><script>window._qwikS(document.currentScript,{},{},{})</script>",
				boundary.boundary_id,
				boundary.content,
				boundary.boundary_id,
				boundary.content_root,
				boundary.fallback_root
			));
		}
	}
	output.push_str("</");
	output.push_str(&container.tag);
	output.push('>');
	output
}
