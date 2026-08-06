//! Plan → Rust source generator (specs/07). Consumes a linked `qwik/ssr-plan` (v0) and emits
//! specialized render functions calling the `qwik-ssr-rt` ABI. Fail-closed: any construct the
//! generator does not support yet aborts generation with a named reason — never silent output.

use serde_json::Value as Json;
use std::collections::HashMap;
use std::fmt::Write as _;

/// Compile-time static attribute escaping (compiler `html-utils.ts` profile: `& < > "`, no `'`).
fn escape_attr_static(input: &str) -> String {
	let mut output = String::with_capacity(input.len());
	for ch in input.chars() {
		match ch {
			'&' => output.push_str("&amp;"),
			'<' => output.push_str("&lt;"),
			'>' => output.push_str("&gt;"),
			'"' => output.push_str("&quot;"),
			_ => output.push(ch),
		}
	}
	output
}

/// Attributes that stringify booleans instead of dropping/bare-rendering them.
fn stringifies_booleans(name: &str) -> bool {
	name.starts_with("aria-") || matches!(name, "spellcheck" | "draggable" | "contenteditable")
}

/// Static attribute serialization (compiler `html-utils.ts` / runtime `styles.ts` — same rules).
fn serialize_static_attr(name: &str, value: &Json) -> Result<String, String> {
	let rendered = match value {
		Json::Null => return Ok(String::new()),
		Json::Bool(boolean) => {
			if stringifies_booleans(name) {
				if *boolean {
					"true".to_string()
				} else {
					"false".to_string()
				}
			} else if *boolean {
				return Ok(format!(" {name}"));
			} else {
				return Ok(String::new());
			}
		}
		Json::String(text) => text.clone(),
		Json::Number(number) => number.to_string(),
		other => return Err(format!("unsupported static attr value {other:?}")),
	};
	Ok(format!(" {name}=\"{}\"", escape_attr_static(&rendered)))
}

struct ComponentGenerator<'plan> {
	plan: &'plan Json,
	module_index: usize,
	body: String,
	statics: String,
	/// Setup binding id → generated local variable name.
	locals: HashMap<u64, String>,
	/// Plan element id → generated runtime-id variable name.
	element_ids: HashMap<u64, String>,
	uses_ctx: bool,
}

/// Emits `pub fn render_<name>(ctx: &mut SsrContext, out: &mut String)` for one component.
pub fn generate_component(plan: &Json, component_index: usize) -> Result<String, String> {
	let component = plan["components"]
		.get(component_index)
		.ok_or("component index out of range")?;
	let name = component["name"].as_str().ok_or("component has no name")?;
	let ssr = &component["ssr"];
	if ssr.is_null() {
		return Err(format!("component {name:?} has no ssr plan"));
	}
	let module_index = component["module"]
		.as_u64()
		.ok_or("component has no module")? as usize;

	let mut generator = ComponentGenerator {
		plan,
		module_index,
		body: String::new(),
		statics: String::new(),
		locals: HashMap::new(),
		element_ids: HashMap::new(),
		uses_ctx: false,
	};
	for entry in ssr["setup"].as_array().ok_or("ssr.setup missing")? {
		generator.write_setup(entry)?;
	}
	generator.write_ops(ssr["ops"].as_array().ok_or("ssr.ops missing")?, "out")?;
	generator.flush_statics("out");

	let ctx_param = if generator.uses_ctx { "ctx" } else { "_ctx" };
	let function_name = format!("render_{}", name.to_lowercase());
	Ok(format!(
		"pub fn {function_name}({ctx_param}: &mut qwik_ssr_rt::render::SsrContext, out: &mut String) {{\n{}}}\n",
		generator.body
	))
}

impl ComponentGenerator<'_> {
	/// Consecutive static output merges into one `push_str` — flushed before any dynamic step.
	fn flush_statics(&mut self, target: &str) {
		if self.statics.is_empty() {
			return;
		}
		if self.statics.chars().count() == 1 {
			let only = self.statics.chars().next().unwrap();
			writeln!(self.body, "    {target}.push({only:?});").unwrap();
		} else {
			writeln!(self.body, "    {target}.push_str({:?});", self.statics).unwrap();
		}
		self.statics.clear();
	}

	fn write_setup(&mut self, entry: &Json) -> Result<(), String> {
		match entry["op"].as_str().ok_or("setup entry has no op")? {
			"signal" => {
				let binding = entry["local"].as_u64().ok_or("signal op has no local")?;
				let variable = format!("local_{binding}");
				let init = literal_expression(&entry["init"])?;
				self.uses_ctx = true;
				writeln!(
					self.body,
					"    let {variable} = std::rc::Rc::new(qwik_ssr_rt::serdes::SerdesValue::Signal(\n        std::cell::RefCell::new(qwik_ssr_rt::serdes::SignalState {{ value: std::rc::Rc::new({init}), subs: Vec::new() }}),\n    ));"
				)
				.unwrap();
				self.locals.insert(binding, variable);
				Ok(())
			}
			op => Err(format!("setup op {op:?} not supported yet")),
		}
	}

	fn write_ops(&mut self, ops: &[Json], target: &str) -> Result<(), String> {
		for op in ops {
			match op["o"].as_str().ok_or("op has no kind")? {
				"static" => {
					// pre-escaped at plan emission (compile-time text profile)
					self.statics
						.push_str(op["html"].as_str().ok_or("static op has no html")?);
				}
				"el" => self.write_element(op, target)?,
				"dyn" => self.write_dynamic(op, target)?,
				kind => return Err(format!("op {kind:?} not supported yet")),
			}
		}
		Ok(())
	}

	fn write_element(&mut self, op: &Json, target: &str) -> Result<(), String> {
		if !op["styleScopedId"].is_null() {
			return Err("style-scoped elements not supported yet".to_string());
		}
		if !op["propsEffect"].is_null() {
			return Err("props effects not supported yet".to_string());
		}
		let tag = op["tag"].as_str().ok_or("element has no tag")?;
		let props = op["props"].as_array().ok_or("element props missing")?;
		let children = op["children"]
			.as_array()
			.ok_or("element children missing")?;
		let has_events = props.iter().any(|prop| prop["p"].as_str() == Some("event"));

		let id_variable = if op["id"].is_null() {
			None
		} else {
			let plan_id = op["id"].as_u64().ok_or("element id not a number")?;
			let variable = format!("element_id_{plan_id}");
			self.uses_ctx = true;
			self.flush_statics(target);
			writeln!(self.body, "    let {variable} = ctx.next_id();").unwrap();
			self.element_ids.insert(plan_id, variable.clone());
			Some(variable)
		};

		if !has_events {
			self.statics.push('<');
			self.statics.push_str(tag);
			if let Some(variable) = &id_variable {
				self.flush_statics(target);
				writeln!(
					self.body,
					"    {target}.push_str(&format!(\" q:id=\\\"{{}}\\\"\", {variable}));"
				)
				.unwrap();
			}
			for prop in props {
				self.write_static_prop(prop)?;
			}
			self.statics.push('>');
			self.write_ops(children, target)?;
			if !op["void"].as_bool().unwrap_or(false) {
				self.statics.push_str(&format!("</{tag}>"));
			}
			return Ok(());
		}

		// events resolve at record assembly, AFTER children — QRL roots must follow value roots
		self.flush_statics(target);
		let children_buffer = format!("children_{}", self.element_ids.len());
		writeln!(self.body, "    let mut {children_buffer} = String::new();").unwrap();
		self.write_ops(children, &children_buffer)?;
		self.flush_statics(&children_buffer);

		self.statics.push('<');
		self.statics.push_str(tag);
		self.flush_statics(target);
		if let Some(variable) = &id_variable {
			writeln!(
				self.body,
				"    {target}.push_str(&format!(\" q:id=\\\"{{}}\\\"\", {variable}));"
			)
			.unwrap();
		}
		for prop in props {
			match prop["p"].as_str().ok_or("prop has no kind")? {
				"event" => self.write_event_prop(prop, target)?,
				_ => {
					self.write_static_prop(prop)?;
					self.flush_statics(target);
				}
			}
		}
		self.statics.push('>');
		self.flush_statics(target);
		writeln!(self.body, "    {target}.push_str(&{children_buffer});").unwrap();
		if !op["void"].as_bool().unwrap_or(false) {
			self.statics.push_str(&format!("</{tag}>"));
		}
		Ok(())
	}

	fn write_static_prop(&mut self, prop: &Json) -> Result<(), String> {
		match prop["p"].as_str().ok_or("prop has no kind")? {
			"static" => {
				let name = prop["name"].as_str().ok_or("static prop has no name")?;
				self.statics
					.push_str(&serialize_static_attr(name, &prop["value"])?);
				Ok(())
			}
			kind => Err(format!("prop {kind:?} not supported yet")),
		}
	}

	fn write_event_prop(&mut self, prop: &Json, target: &str) -> Result<(), String> {
		let attr_name = prop["name"].as_str().ok_or("event prop has no name")?;
		let handlers = prop["handlers"]
			.as_array()
			.ok_or("event handlers missing")?;
		let [handler] = handlers.as_slice() else {
			return Err("multi-handler events not supported yet".to_string());
		};
		let segment_id = handler["value"]["segment"]
			.as_str()
			.ok_or("event handler without a segment (bind handlers not supported yet)")?;
		let qrl = self.qrl_expression(segment_id)?;
		self.uses_ctx = true;
		writeln!(
			self.body,
			"    {target}.push_str(&ctx.event_attr({attr_name:?}, {qrl}));"
		)
		.unwrap();
		Ok(())
	}

	fn write_dynamic(&mut self, op: &Json, target: &str) -> Result<(), String> {
		if op["output"].as_str() != Some("text") {
			return Err("dynamic content output not supported yet".to_string());
		}
		let plan_target = &op["target"];
		if plan_target["kind"].as_str() != Some("element") {
			return Err("range-targeted dynamic text not supported yet".to_string());
		}
		let plan_id = plan_target["id"]
			.as_u64()
			.ok_or("dynamic target has no id")?;
		let element_variable = self
			.element_ids
			.get(&plan_id)
			.ok_or("dynamic text targets an unopened element")?
			.clone();
		let ir = &op["value"]["ir"];
		if ir["k"].as_str() != Some("signal-read") {
			return Err(format!("dynamic value ir {ir} not supported yet"));
		}
		let binding = ir["binding"].as_u64().ok_or("signal-read has no binding")?;
		let signal = self
			.locals
			.get(&binding)
			.ok_or(format!("signal-read of unknown binding {binding}"))?
			.clone();
		self.uses_ctx = true;
		self.flush_statics(target);
		writeln!(
			self.body,
			"    ctx.serializer.add_root(std::rc::Rc::clone(&{signal}));\n    \
			 ctx.subscribe_element_text(&{signal}, {element_variable});\n    \
			 {target}.push_str(&qwik_ssr_rt::escape::escape_html(&qwik_ssr_rt::render::signal_text(&{signal})));"
		)
		.unwrap();
		Ok(())
	}

	fn qrl_expression(&self, segment_id: &str) -> Result<String, String> {
		let segments = self.plan["modules"][self.module_index]["segments"]
			.as_array()
			.ok_or("module segments missing")?;
		let segment = segments
			.iter()
			.find(|segment| segment["id"].as_str() == Some(segment_id))
			.ok_or(format!("segment {segment_id:?} missing from the plan"))?;
		let chunk = segment["chunk"]
			.as_str()
			.ok_or("segment has no chunk")?
			.trim_start_matches("./");
		let symbol = segment["symbolName"]
			.as_str()
			.ok_or("segment has no symbol")?;
		let mut captures = String::new();
		for capture in segment["captures"]
			.as_array()
			.ok_or("segment captures missing")?
		{
			let binding = capture["binding"]
				.as_u64()
				.ok_or("capture has no binding")?;
			let local = self
				.locals
				.get(&binding)
				.ok_or(format!("capture of unknown binding {binding}"))?;
			write!(captures, "std::rc::Rc::clone(&{local}), ").unwrap();
		}
		Ok(format!(
			"std::rc::Rc::new(qwik_ssr_rt::serdes::SerdesValue::Qrl(qwik_ssr_rt::serdes::QrlValue {{\n        chunk: {chunk:?}.to_string(), symbol: {symbol:?}.to_string(), captures: vec![{captures}],\n    }}))"
		))
	}
}

fn literal_expression(ir: &Json) -> Result<String, String> {
	match ir["k"].as_str().ok_or("ir node has no kind")? {
		"lit" => match &ir["v"] {
			Json::Number(number) => Ok(format!(
				"qwik_ssr_rt::serdes::SerdesValue::Number({}f64)",
				number.as_f64().ok_or("literal is not an f64")?
			)),
			Json::String(text) => Ok(format!(
				"qwik_ssr_rt::serdes::SerdesValue::String({text:?}.to_string())"
			)),
			Json::Bool(boolean) => Ok(format!("qwik_ssr_rt::serdes::SerdesValue::Bool({boolean})")),
			Json::Null => Ok("qwik_ssr_rt::serdes::SerdesValue::Null".to_string()),
			other => Err(format!("literal {other:?} not supported yet")),
		},
		"undef" => Ok("qwik_ssr_rt::serdes::SerdesValue::Undefined".to_string()),
		kind => Err(format!("setup ir {kind:?} not supported yet")),
	}
}
