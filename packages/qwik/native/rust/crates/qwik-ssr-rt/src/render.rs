//! Render context and page assembly (specs/05). Mirrors `server/ssr-render.ts` +
//! `ssr-script-emitter.ts` + `ssr-events.ts`: one id counter per request, deferred event
//! attributes, state script → qwikloader → `_qwikEv` registration tail.

use crate::escape::escape_html;
use crate::number::to_js_string;
use crate::serdes::{
	EffectSubscription, SerdesValue, Serializer, EFFECT_KIND_TEXT_EXPRESSION,
	EFFECT_KIND_TEXT_NODE, EFFECT_TARGET_ELEMENT_TEXT, EFFECT_TARGET_RANGE_TEXT,
};
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
}

pub struct SsrContext {
	pub serializer: Serializer,
	next_id: u32,
	/// Scoped event names in registration order (`e:click`, …).
	event_names: Vec<String>,
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
		let value = if !qrl_value.symbol.starts_with('_') && !qrl_value.captures.is_empty() {
			let root_id = self.serializer.add_root(Rc::clone(&qrl));
			format!("mock-chunk#_run#{root_id}")
		} else if qrl_value.captures.is_empty() {
			format!("{}#{}", qrl_value.chunk, qrl_value.symbol)
		} else {
			panic!("`_`-symbol QRLs with captures not supported yet (bind handlers)");
		};
		format!(" {attr_name}=\"{}\"", escape_html(&value))
	}

	/// TextNode effect subscription on an element-text target (`renderSsrTextNode`).
	pub fn subscribe_element_text(&mut self, signal: &Rc<SerdesValue>, target_id: u32) {
		push_subscription(
			signal,
			EffectSubscription {
				kind: EFFECT_KIND_TEXT_NODE,
				target_kind: EFFECT_TARGET_ELEMENT_TEXT,
				target_id,
				marker_index: None,
				deps: vec![Rc::clone(signal)],
				args: None,
				qrl: None,
			},
		);
	}

	/// TextNode effect subscription on a range-text target (`<!t>` fenced).
	pub fn subscribe_range_text(&mut self, signal: &Rc<SerdesValue>, target_id: u32, marker: u32) {
		push_subscription(
			signal,
			EffectSubscription {
				kind: EFFECT_KIND_TEXT_NODE,
				target_kind: EFFECT_TARGET_RANGE_TEXT,
				target_id,
				marker_index: Some(marker),
				deps: vec![Rc::clone(signal)],
				args: None,
				qrl: None,
			},
		);
	}

	/// TextExpression effect (`renderSsrTextExpression`): args are the segment captures the
	/// browser passes to the resume QRL; deps are the signals read during server evaluation.
	pub fn subscribe_text_expression(
		&mut self,
		signal: &Rc<SerdesValue>,
		target_id: u32,
		marker: u32,
		args: Vec<Rc<SerdesValue>>,
		qrl: Rc<SerdesValue>,
	) {
		push_subscription(
			signal,
			EffectSubscription {
				kind: EFFECT_KIND_TEXT_EXPRESSION,
				target_kind: EFFECT_TARGET_RANGE_TEXT,
				target_id,
				marker_index: Some(marker),
				deps: vec![Rc::clone(signal)],
				args: Some(args),
				qrl: Some(qrl),
			},
		);
	}
}

fn push_subscription(signal: &Rc<SerdesValue>, subscription: EffectSubscription) {
	let SerdesValue::Signal(state) = &**signal else {
		panic!("subscription target must be a Signal value");
	};
	state.borrow_mut().subs.push(subscription);
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
	output.push_str(&body);

	let has_roots = ctx.serializer.root_count() > 0;
	let has_events = !ctx.event_names.is_empty();
	if has_roots {
		output.push_str(&ctx.serializer.emit_state_scripts());
	}
	if has_events {
		output.push_str("<script id=\"qwikloader\" async type=\"module\">");
		output.push_str(&options.qwik_loader);
		output.push_str("</script>");
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
	output.push_str("</");
	output.push_str(&container.tag);
	output.push('>');
	output
}
