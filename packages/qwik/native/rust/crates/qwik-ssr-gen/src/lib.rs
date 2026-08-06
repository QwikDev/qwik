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

/// Render function name for a plan component.
pub fn render_function_name(plan: &Json, component_index: usize) -> Result<String, String> {
	let name = plan["components"][component_index]["name"]
		.as_str()
		.ok_or("component has no name")?;
	Ok(format!("render_{}", name.to_lowercase()))
}

fn component_has_props(plan: &Json, component_index: usize) -> bool {
	plan["components"][component_index]["propsBindings"]
		.as_array()
		.is_some_and(|bindings| !bindings.is_empty())
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
	temp_counter: usize,
	uses_ctx: bool,
	uses_props: bool,
}

/// Emits `pub fn render_<name>(ctx, out[, props])` for one component of a linked plan.
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
		temp_counter: 0,
		uses_ctx: false,
		uses_props: false,
	};
	let props_bindings = component["propsBindings"]
		.as_array()
		.ok_or("propsBindings missing")?
		.clone();
	for binding in &props_bindings {
		let binding = binding.as_u64().ok_or("props binding not a number")?;
		generator.locals.insert(binding, "props".to_string());
	}
	for entry in ssr["setup"].as_array().ok_or("ssr.setup missing")? {
		generator.write_setup(entry)?;
	}
	generator.write_ops(ssr["ops"].as_array().ok_or("ssr.ops missing")?, "out")?;
	generator.flush_statics("out");

	let ctx_param = if generator.uses_ctx { "ctx" } else { "_ctx" };
	let (props_param, props_rebind) = if props_bindings.is_empty() {
		(String::new(), String::new())
	} else if generator.uses_props {
		(
			", props: &std::rc::Rc<qwik_ssr_rt::serdes::SerdesValue>".to_string(),
			// rebind owned so generated borrows are uniform with other locals
			"    let props = std::rc::Rc::clone(props);\n".to_string(),
		)
	} else {
		(
			", _props: &std::rc::Rc<qwik_ssr_rt::serdes::SerdesValue>".to_string(),
			String::new(),
		)
	};
	let function_name = render_function_name(plan, component_index)?;
	Ok(format!(
		"pub fn {function_name}({ctx_param}: &mut qwik_ssr_rt::render::SsrContext, out: &mut String{props_param}) {{\n{props_rebind}{}}}\n",
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
				"component" => self.write_component(op, target)?,
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
		let children_buffer = format!("children_{}", self.next_temp());
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
		let qrl = self.qrl_expression(segment_id, true)?;
		self.uses_ctx = true;
		writeln!(
			self.body,
			"    {target}.push_str(&ctx.event_attr({attr_name:?}, {qrl}));"
		)
		.unwrap();
		Ok(())
	}

	fn write_component(&mut self, op: &Json, target: &str) -> Result<(), String> {
		let reference = op["target"]["ref"]
			.as_u64()
			.ok_or("component op is not linked to a ref")? as usize;
		if !op["slots"].as_array().is_none_or(|slots| slots.is_empty()) {
			return Err("component slots not supported yet".to_string());
		}
		if !op["propsSource"].is_null() {
			return Err("component propsSource not supported yet".to_string());
		}
		self.flush_statics(target);
		self.uses_ctx = true;

		let mut statics_entries = String::new();
		let mut sources_entries = String::new();
		let mut source_locals = Vec::new();
		for prop in op["props"].as_array().ok_or("component props missing")? {
			match prop["p"].as_str().ok_or("prop has no kind")? {
				"static" => {
					let name = prop["name"].as_str().ok_or("static prop has no name")?;
					let value = json_literal_expression(&prop["value"])?;
					write!(
						statics_entries,
						"({name:?}.to_string(), std::rc::Rc::new({value})), "
					)
					.unwrap();
				}
				"dynamic" => {
					let ir = &prop["value"]["ir"];
					if ir["k"].as_str() != Some("signal-read") {
						return Err(format!("component prop ir {ir} not supported yet"));
					}
					let name = prop["name"].as_str().ok_or("dynamic prop has no name")?;
					let signal = self.signal_local(ir)?;
					write!(
						sources_entries,
						"({name:?}.to_string(), std::rc::Rc::clone(&{signal})), "
					)
					.unwrap();
					source_locals.push(signal);
				}
				kind => return Err(format!("component prop {kind:?} not supported yet")),
			}
		}

		let child_function = render_function_name(self.plan, reference)?;
		let child_takes_props = component_has_props(self.plan, reference);
		let target_argument = if target == "out" {
			"out".to_string()
		} else {
			format!("&mut {target}")
		};

		// dynamic prop sources become state roots when the component is created
		for signal in &source_locals {
			writeln!(
				self.body,
				"    ctx.serializer.add_root(std::rc::Rc::clone(&{signal}));"
			)
			.unwrap();
		}
		if !child_takes_props {
			writeln!(self.body, "    {child_function}(ctx, {target_argument});").unwrap();
			return Ok(());
		}
		let props_variable = format!("props_{}", self.next_temp());
		if source_locals.is_empty() {
			// static-only props pass as a bare object literal (no Props record)
			writeln!(
				self.body,
				"    let {props_variable} = std::rc::Rc::new(qwik_ssr_rt::serdes::SerdesValue::Object(vec![{statics_entries}]));"
			)
			.unwrap();
		} else {
			writeln!(
				self.body,
				"    let {props_variable} = std::rc::Rc::new(qwik_ssr_rt::serdes::SerdesValue::Props(\n        qwik_ssr_rt::serdes::PropsValue {{ statics: vec![{statics_entries}], sources: vec![{sources_entries}] }},\n    ));"
			)
			.unwrap();
		}
		writeln!(
			self.body,
			"    {child_function}(ctx, {target_argument}, &{props_variable});"
		)
		.unwrap();
		Ok(())
	}

	fn write_dynamic(&mut self, op: &Json, target: &str) -> Result<(), String> {
		if op["output"].as_str() != Some("text") {
			return Err("dynamic content output not supported yet".to_string());
		}
		let plan_target = &op["target"];
		let target_kind = plan_target["kind"]
			.as_str()
			.ok_or("dynamic target missing")?;
		let plan_id = plan_target["id"]
			.as_u64()
			.ok_or("dynamic target has no id")?;
		let element_variable = self
			.element_ids
			.get(&plan_id)
			.ok_or("dynamic text targets an unopened element")?
			.clone();
		let is_range = match target_kind {
			"element" => false,
			"range" => true,
			kind => return Err(format!("dynamic target kind {kind:?} not supported yet")),
		};
		self.uses_ctx = true;
		if is_range {
			// range text is fenced by <!t> markers (element-targeted text stays bare)
			self.statics.push_str("<!t>");
		}
		self.flush_statics(target);

		let ir = &op["value"]["ir"];
		if ir["k"].as_str() == Some("signal-read") {
			let signal = self.signal_local(ir)?;
			let subscribe = if is_range {
				let marker = plan_target["marker"]
					.as_u64()
					.ok_or("range target has no marker")?;
				format!("ctx.subscribe_range_text(&{signal}, {element_variable}, {marker});")
			} else {
				format!("ctx.subscribe_element_text(&{signal}, {element_variable});")
			};
			writeln!(
				self.body,
				"    ctx.serializer.add_root(std::rc::Rc::clone(&{signal}));\n    {subscribe}\n    \
				 {target}.push_str(&qwik_ssr_rt::escape::escape_html(&qwik_ssr_rt::render::signal_text(&{signal})));"
			)
			.unwrap();
		} else if let Some(segment_id) = op["value"]["segment"].as_str() {
			if !is_range {
				return Err("element-targeted expression text not supported yet".to_string());
			}
			let marker = plan_target["marker"]
				.as_u64()
				.ok_or("range target has no marker")?;
			let captures = self.segment_captures(segment_id)?;
			let mut args = String::new();
			for capture in &captures {
				write!(args, "std::rc::Rc::clone(&{capture}), ").unwrap();
			}
			// captures are state roots (browser resume args) — registered before the effect
			for capture in &captures {
				writeln!(
					self.body,
					"    ctx.serializer.add_root(std::rc::Rc::clone(&{capture}));"
				)
				.unwrap();
			}
			let temp = self.next_temp();
			let tracked = format!("tracked_{temp}");
			let value = format!("value_{temp}");
			let expression = self.ir_expression(ir, &tracked)?;
			let qrl = self.qrl_expression(segment_id, false)?;
			writeln!(
				self.body,
				"    let mut {tracked}: Vec<std::rc::Rc<qwik_ssr_rt::serdes::SerdesValue>> = Vec::new();\n    \
				 let {value} = {expression};\n    \
				 if let Some(dep) = {tracked}.first() {{\n        \
				 ctx.subscribe_text_expression(dep, {element_variable}, {marker}, vec![{args}], {qrl});\n    \
				 }}\n    \
				 {target}.push_str(&qwik_ssr_rt::escape::escape_html(&qwik_ssr_rt::render::value_text(&{value})));"
			)
			.unwrap();
		} else {
			return Err(format!("dynamic value ir {ir} not supported yet"));
		}

		if is_range {
			self.statics.push_str("<!/t>");
		}
		Ok(())
	}

	fn next_temp(&mut self) -> usize {
		let next = self.temp_counter;
		self.temp_counter += 1;
		next
	}

	fn signal_local(&mut self, ir: &Json) -> Result<String, String> {
		let binding = ir["binding"].as_u64().ok_or("signal-read has no binding")?;
		self.local(binding)
	}

	fn local(&mut self, binding: u64) -> Result<String, String> {
		let variable = self
			.locals
			.get(&binding)
			.cloned()
			.ok_or(format!("unknown binding {binding}"))?;
		if variable == "props" {
			self.uses_props = true;
		}
		Ok(variable)
	}

	fn segment_captures(&mut self, segment_id: &str) -> Result<Vec<String>, String> {
		let bindings: Vec<u64> = self.segment(segment_id)?["captures"]
			.as_array()
			.ok_or("segment captures missing")?
			.iter()
			.map(|capture| capture["binding"].as_u64().ok_or("capture has no binding"))
			.collect::<Result<_, _>>()?;
		bindings
			.into_iter()
			.map(|binding| self.local(binding))
			.collect()
	}

	fn segment(&self, segment_id: &str) -> Result<&'_ Json, String> {
		self.plan["modules"][self.module_index]["segments"]
			.as_array()
			.ok_or("module segments missing")?
			.iter()
			.find(|segment| segment["id"].as_str() == Some(segment_id))
			.ok_or(format!("segment {segment_id:?} missing from the plan"))
	}

	/// Segment QRL; `with_captures` carries the capture values on the QRL record itself
	/// (event handlers), otherwise they ride the subscription args (expression effects).
	fn qrl_expression(&mut self, segment_id: &str, with_captures: bool) -> Result<String, String> {
		let segment = self.segment(segment_id)?;
		let chunk = segment["chunk"]
			.as_str()
			.ok_or("segment has no chunk")?
			.trim_start_matches("./")
			.to_string();
		let symbol = segment["symbolName"]
			.as_str()
			.ok_or("segment has no symbol")?
			.to_string();
		let mut captures = String::new();
		if with_captures {
			for capture in self.segment_captures(segment_id)? {
				write!(captures, "std::rc::Rc::clone(&{capture}), ").unwrap();
			}
		}
		Ok(format!(
			"std::rc::Rc::new(qwik_ssr_rt::serdes::SerdesValue::Qrl(qwik_ssr_rt::serdes::QrlValue {{\n        chunk: {chunk:?}.to_string(), symbol: {symbol:?}.to_string(), captures: vec![{captures}],\n    }}))"
		))
	}

	/// Compile a ValueIR tree to a Rust expression producing `Rc<SerdesValue>`; signal and
	/// props-source reads record into `tracked` (auto-track — the effect deps).
	fn ir_expression(&mut self, ir: &Json, tracked: &str) -> Result<String, String> {
		match ir["k"].as_str().ok_or("ir node has no kind")? {
			"signal-read" => {
				let signal = self.signal_local(ir)?;
				Ok(format!(
					"qwik_ssr_rt::render::tracked_signal_value(&{signal}, &mut {tracked})"
				))
			}
			"member" => {
				let object = &ir["obj"];
				if object["k"].as_str() != Some("binding-read") {
					return Err(format!("member of {object} not supported yet"));
				}
				let binding = object["binding"]
					.as_u64()
					.ok_or("binding-read has no binding")?;
				let variable = self.local(binding)?;
				let name = ir["name"].as_str().ok_or("member has no name")?;
				Ok(format!(
					"qwik_ssr_rt::render::props_member(&{variable}, {name:?}, &mut {tracked})"
				))
			}
			"lit" => Ok(format!("std::rc::Rc::new({})", literal_expression(ir)?)),
			"undef" => {
				Ok("std::rc::Rc::new(qwik_ssr_rt::serdes::SerdesValue::Undefined)".to_string())
			}
			"bin" => {
				let left = self.ir_expression(&ir["a"], tracked)?;
				let right = self.ir_expression(&ir["b"], tracked)?;
				let helper = match ir["op"].as_str().ok_or("bin op missing")? {
					"+" => "js_add",
					op => return Err(format!("binary operator {op:?} not supported yet")),
				};
				Ok(format!("qwik_ssr_rt::render::{helper}(&{left}, &{right})"))
			}
			kind => Err(format!("ir kind {kind:?} not supported yet")),
		}
	}
}

fn literal_expression(ir: &Json) -> Result<String, String> {
	match ir["k"].as_str().ok_or("ir node has no kind")? {
		"lit" => json_literal_expression(&ir["v"]),
		"undef" => Ok("qwik_ssr_rt::serdes::SerdesValue::Undefined".to_string()),
		kind => Err(format!("setup ir {kind:?} not supported yet")),
	}
}

fn json_literal_expression(value: &Json) -> Result<String, String> {
	match value {
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
	}
}
