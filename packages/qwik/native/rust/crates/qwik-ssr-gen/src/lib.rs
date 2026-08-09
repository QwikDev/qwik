//! Plan → Rust source generator (specs/07). Consumes a linked `qwik/ssr-plan` (v0) and emits
//! specialized render functions calling the `qwik` ABI. Fail-closed: any construct the
//! generator does not support yet aborts generation with a named reason — never silent output.

pub mod project;

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

/// True when the component's render surface contains a `slot` op (grows a `slots` parameter).
fn component_uses_slots(plan: &Json, component_index: usize) -> bool {
	fn ops_contain_slot(ops: &[Json]) -> bool {
		ops.iter().any(|op| match op["kind"].as_str() {
			Some("slot") => true,
			Some("element") => op["children"]
				.as_array()
				.is_some_and(|children| ops_contain_slot(children)),
			_ => false,
		})
	}
	plan["components"][component_index]["ssr"]["ops"]
		.as_array()
		.is_some_and(|ops| ops_contain_slot(ops))
}

fn component_has_props(plan: &Json, component_index: usize) -> bool {
	plan["components"][component_index]["propsBindings"]
		.as_array()
		.is_some_and(|bindings| !bindings.is_empty())
}

/// Chunk symbols may contain `$` — sanitize for the generated fn name (QRLs keep the original).
fn rust_fn_name(symbol: &str) -> String {
	let mut name: String = symbol
		.chars()
		.map(|character| {
			if character.is_ascii_alphanumeric() || character == '_' {
				character
			} else {
				'_'
			}
		})
		.collect();
	if name
		.chars()
		.next()
		.is_some_and(|first| first.is_ascii_digit())
	{
		name.insert_str(0, "s_");
	}
	name
}

/// Per-kind signature head for generated segment fns (specs/07 invocation convention).
enum SegmentFnKind {
	LocalComponent(Json),
	BranchArm,
	CollectionRow {
		param_bindings: Vec<u64>,
		uses_index_signal: bool,
	},
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum LocalKind {
	Signal,
	Store,
	Computed,
	IndexSignal,
	PlainValue,
}

struct ComponentGenerator<'plan> {
	plan: &'plan Json,
	module_index: usize,
	body: String,
	statics: String,
	/// Setup binding id → generated local variable name.
	locals: HashMap<u64, String>,
	/// Setup binding id → reactive kind (drives read codegen).
	local_kinds: HashMap<u64, LocalKind>,
	/// Computed binding → body ValueIR (evaluated lazily at read sites).
	computed_fns: HashMap<u64, String>,
	/// Next element op opens a For row root (`q:row` attribute).
	pending_row_root: bool,
	/// `useOn` attrs awaiting the component's first element (attr name, task variable).
	pending_use_on: Vec<(String, String)>,
	/// Context entries this component provides: (context name, value variable).
	provided_contexts: Vec<(String, String)>,
	/// Lexically visible local components: name -> local-component setup entry.
	local_components: HashMap<String, Json>,
	/// Local components currently expanding inline (recursion guard).
	/// Standalone fns for local components declared in this scope (QRL invocation convention).
	pending_segment_fns: Vec<String>,
	/// Generated segment fns that render slots and take the slots-table parameter.
	segment_fn_takes_slots: HashMap<String, bool>,
	/// Object-pattern props: chunks replay the full destructure, tracking every source.
	destructured_props: bool,
	/// Plan element id → generated runtime-id variable name.
	element_ids: HashMap<u64, String>,
	temp_counter: usize,
	uses_ctx: bool,
	uses_props: bool,
	uses_slots: bool,
}

/// Emits the module's auto-lowered helper functions (`defs`, specs/02).
/// Emit the plugin-provided fn sources for one target (specs/09). Each source is a plain Rust
/// file defining `pub fn <exportName>(args: &[Rc<SerdesValue>]) -> Rc<SerdesValue>`; it is
/// wrapped in a `pub mod <nativeName>` so names never collide across plugin modules.
/// Wrapper module name: `native$` carries none, so derive a stable one from the fn id.
fn plugin_module_name(entry: &Json, fn_id: &str) -> String {
	entry["nativeName"]
		.as_str()
		.map(str::to_string)
		.unwrap_or_else(|| {
			let sanitized: String = fn_id
				.chars()
				.map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
				.collect();
			format!("plugin_{sanitized}")
		})
}

pub fn generate_plugin_fns(plan: &Json, target: &str) -> Result<String, String> {
	let Some(plugin_fns) = plan["pluginFns"].as_array() else {
		return Ok(String::new());
	};
	let mut output = String::new();
	for entry in plugin_fns {
		let fn_id = entry["fnId"].as_str().ok_or("plugin fn has no fnId")?;
		// a package is a crate dependency of the app: nothing to splice, calls go straight to it
		if entry["targets"][target]["crate"].is_string() {
			continue;
		}
		let native_name = plugin_module_name(entry, fn_id);
		let export_name = entry["exportName"]
			.as_str()
			.ok_or("plugin fn has no exportName")?;
		let source = entry["targets"][target]["source"]
			.as_str()
			.ok_or(format!("plugin fn {fn_id:?} has no {target:?} target"))?;
		if !source.contains(&format!("fn {export_name}")) {
			return Err(format!(
				"plugin fn {fn_id:?} {target} source does not define `pub fn {export_name}`"
			));
		}
		writeln!(output, "pub mod {native_name} {{\n{source}}}").unwrap();
	}
	Ok(output)
}

pub fn generate_defs(plan: &Json, module_index: usize) -> Result<String, String> {
	let Some(defs) = plan["modules"][module_index]["defs"].as_array() else {
		return Ok(String::new());
	};
	let mut output = String::new();
	for (index, def) in defs.iter().enumerate() {
		let mut generator = ComponentGenerator {
			plan,
			module_index,
			body: String::new(),
			statics: String::new(),
			locals: HashMap::new(),
			local_kinds: HashMap::new(),
			computed_fns: HashMap::new(),
			pending_row_root: false,
			pending_use_on: Vec::new(),
			provided_contexts: Vec::new(),
			local_components: HashMap::new(),
			pending_segment_fns: Vec::new(),
			segment_fn_takes_slots: HashMap::new(),
			destructured_props: false,
			element_ids: HashMap::new(),
			temp_counter: 0,
			uses_ctx: false,
			uses_props: false,
			uses_slots: false,
		};
		let mut params_signature = String::new();
		for (position, binding) in def["params"]
			.as_array()
			.ok_or("def params missing")?
			.iter()
			.enumerate()
		{
			let binding = binding.as_u64().ok_or("def param binding not a number")?;
			let variable = format!("def_param_{position}");
			generator.locals.insert(binding, variable.clone());
			generator.local_kinds.insert(binding, LocalKind::PlainValue);
			write!(
				params_signature,
				"{variable}: &std::rc::Rc<qwik::serdes::SerdesValue>, "
			)
			.unwrap();
		}
		let body = generator.ir_expression(&def["body"], "&mut def_tracked")?;
		write!(
			output,
			"fn def_{module_index}_{index}({params_signature}) -> std::rc::Rc<qwik::serdes::SerdesValue> {{\n    \
			 let mut def_tracked: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();\n    \
			 let _ = &mut def_tracked;\n    \
			 {body}\n}}\n"
		)
		.unwrap();
	}
	Ok(output)
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
		local_kinds: HashMap::new(),
		computed_fns: HashMap::new(),
		pending_row_root: false,
		pending_use_on: Vec::new(),
		provided_contexts: Vec::new(),
		local_components: HashMap::new(),
		pending_segment_fns: Vec::new(),
		segment_fn_takes_slots: HashMap::new(),
		destructured_props: false,
		element_ids: HashMap::new(),
		temp_counter: 0,
		uses_ctx: false,
		uses_props: false,
		uses_slots: false,
	};
	let props_bindings = component["propsBindings"]
		.as_array()
		.ok_or("propsBindings missing")?
		.clone();
	// destructured props rebind their values at fn start, like the emitted `const { x } = props`;
	// identifier form binds the props object itself. Captures keep passing the object
	// (`component-prop` access) — see segment_captures.
	let props_plan = &component["props"];
	if props_plan["kind"].as_str() == Some("object") {
		generator.destructured_props = true;
		for binding_entry in props_plan["bindings"]
			.as_array()
			.ok_or("component props bindings missing")?
		{
			let binding = binding_entry["binding"]
				.as_u64()
				.ok_or("prop binding not a number")?;
			let prop_name = binding_entry["name"]
				.as_str()
				.ok_or("prop binding has no name")?;
			let variable = format!("prop_{binding}");
			writeln!(
				generator.body,
				"    let {variable} = qwik::render::props_value(&props, {prop_name:?});"
			)
			.unwrap();
			generator.uses_props = true;
			generator.locals.insert(binding, variable);
			generator.local_kinds.insert(binding, LocalKind::PlainValue);
		}
	} else {
		for binding in &props_bindings {
			let binding = binding.as_u64().ok_or("props binding not a number")?;
			generator.locals.insert(binding, "props".to_string());
		}
	}
	for entry in ssr["setup"].as_array().ok_or("ssr.setup missing")? {
		generator.write_setup(entry)?;
	}
	let provided = std::mem::take(&mut generator.provided_contexts);
	if !provided.is_empty() {
		let mut entries = String::new();
		for (name, value) in &provided {
			write!(
				entries,
				"({name:?}.to_string(), std::rc::Rc::clone(&{value})), "
			)
			.unwrap();
		}
		generator.uses_ctx = true;
		writeln!(
			generator.body,
			"    let context_scope = std::rc::Rc::new(qwik::serdes::SerdesValue::ContextScope(\n        std::cell::RefCell::new(qwik::serdes::ContextScopeState {{ parent: ctx.current_context(), entries: vec![{entries}] }}),\n    ));\n    \
			 let context_scope_root = ctx.serializer.add_root(std::rc::Rc::clone(&context_scope));\n    \
			 ctx.push_context(context_scope);\n    \
			 out.push_str(&format!(\"<!c={{}}>\", context_scope_root));"
		)
		.unwrap();
	}
	generator.write_ops(ssr["ops"].as_array().ok_or("ssr.ops missing")?, "out")?;
	generator.flush_statics("out");
	if !provided.is_empty() {
		writeln!(
			generator.body,
			"    out.push_str(\"<!/c>\");\n    ctx.pop_context();"
		)
		.unwrap();
	}

	let ctx_param = if generator.uses_ctx { "ctx" } else { "_ctx" };
	let (props_param, props_rebind) = if props_bindings.is_empty() {
		(String::new(), String::new())
	} else if generator.uses_props {
		(
			", props: &std::rc::Rc<qwik::serdes::SerdesValue>".to_string(),
			// rebind owned so generated borrows are uniform with other locals
			"    let props = std::rc::Rc::clone(props);\n".to_string(),
		)
	} else {
		(
			", _props: &std::rc::Rc<qwik::serdes::SerdesValue>".to_string(),
			String::new(),
		)
	};
	let slots_param = if !component_uses_slots(plan, component_index) {
		String::new()
	} else if generator.uses_slots {
		", slots: &mut [(&str, &mut dyn FnMut(&mut qwik::render::SsrContext, &mut String))]"
			.to_string()
	} else {
		", _slots: &mut [(&str, &mut dyn FnMut(&mut qwik::render::SsrContext, &mut String))]"
			.to_string()
	};
	let function_name = render_function_name(plan, component_index)?;
	let local_fns = generator.pending_segment_fns.join("");
	Ok(format!(
		"pub fn {function_name}({ctx_param}: &mut qwik::render::SsrContext, out: &mut String{props_param}{slots_param}) {{\n{props_rebind}{}}}\n{local_fns}",
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
		match entry["kind"].as_str().ok_or("setup entry has no op")? {
			"signal" => {
				let binding = entry["binding"].as_u64().ok_or("signal op has no local")?;
				let variable = format!("local_{binding}");
				// plugin-call inits are already Rc-valued; literals wrap here
				let init_rc = if entry["init"]["kind"].as_str() == Some("plugin-call") {
					self.plugin_call_expression(&entry["init"].clone())?
				} else {
					format!("std::rc::Rc::new({})", literal_expression(&entry["init"])?)
				};
				self.uses_ctx = true;
				writeln!(
					self.body,
					"    let {variable} = std::rc::Rc::new(qwik::serdes::SerdesValue::Signal(\n        std::cell::RefCell::new(qwik::serdes::SignalState {{ value: {init_rc}, subs: Vec::new() }}),\n    ));"
				)
				.unwrap();
				self.locals.insert(binding, variable);
				self.local_kinds.insert(binding, LocalKind::Signal);
				Ok(())
			}
			"store" => {
				let binding = entry["binding"].as_u64().ok_or("store op has no local")?;
				if entry["deep"].as_bool() != Some(true) {
					return Err("shallow stores not supported yet".to_string());
				}
				let variable = format!("local_{binding}");
				let raw = object_literal_expression(&entry["init"])?;
				self.uses_ctx = true;
				writeln!(
					self.body,
					"    let {variable} = std::rc::Rc::new(qwik::serdes::SerdesValue::Store(\n        std::cell::RefCell::new(qwik::serdes::StoreState {{ raw: std::rc::Rc::new({raw}), records: Vec::new(), prop_handles: Vec::new() }}),\n    ));"
				)
				.unwrap();
				self.locals.insert(binding, variable);
				self.local_kinds.insert(binding, LocalKind::Store);
				Ok(())
			}
			"computed" => {
				let binding = entry["binding"].as_u64().ok_or("computed op has no local")?;
				let segment = entry["segment"]
					.as_str()
					.ok_or("computed op has no segment")?;
				if entry["body"].is_null() {
					return Err("computed without a lowered body".to_string());
				}
				let variable = format!("local_{binding}");
				let qrl = self.qrl_expression(segment, true)?;
				self.uses_ctx = true;
				writeln!(
					self.body,
					"    let {variable} = qwik::render::new_computed({qrl});"
				)
				.unwrap();
				self.locals.insert(binding, variable);
				self.local_kinds.insert(binding, LocalKind::Computed);
				let symbol = self.generate_value_fn(segment, &entry["body"].clone())?;
				self.computed_fns.insert(binding, symbol);
				Ok(())
			}
			"task" => {
				let segment = entry["segment"].as_str().ok_or("task op has no segment")?;
				let steps = entry["body"]["steps"]
					.as_array()
					.ok_or("task without a lowered body")?
					.clone();
				let qrl = self.qrl_expression(segment, true)?;
				let mut body = String::new();
				self.task_steps(&steps, "tracked", &mut body)?;
				self.uses_ctx = true;
				writeln!(
					self.body,
					"    ctx.run_task(0, {qrl}, |tracked| {{\n{body}    }});"
				)
				.unwrap();
				Ok(())
			}
			"qrl-const" => {
				let binding = entry["binding"].as_u64().ok_or("qrl-const has no local")?;
				let segment = entry["segment"]
					.as_str()
					.ok_or("qrl-const has no segment")?;
				let qrl = self.qrl_expression(segment, true)?;
				let variable = format!("local_{binding}");
				writeln!(self.body, "    let {variable} = {qrl};").unwrap();
				self.locals.insert(binding, variable);
				self.local_kinds.insert(binding, LocalKind::PlainValue);
				Ok(())
			}
			"context-provider" => {
				let context = entry["context"]
					.as_u64()
					.ok_or("context-provider has no context binding")?;
				let name = self.context_name(context)?;
				let value_ir = entry["value"].clone();
				let value = if value_ir["kind"].as_str() == Some("binding-read") {
					self.local(
						value_ir["binding"]
							.as_u64()
							.ok_or("context value has no binding")?,
					)?
				} else {
					// evaluated once at provide time, like the emitted argument expression
					let temp = self.next_temp();
					let tracked = format!("context_tracked_{temp}");
					let expression = self.ir_expression(&value_ir, &format!("&mut {tracked}"))?;
					let variable = format!("context_value_{temp}");
					writeln!(
						self.body,
						"    let mut {tracked}: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();\n    \
						 let {variable} = {expression};\n    \
						 let _ = {tracked};"
					)
					.unwrap();
					variable
				};
				self.provided_contexts.push((name, value));
				Ok(())
			}
			"context-read" => {
				let binding = entry["binding"].as_u64().ok_or("context-read has no local")?;
				let context = entry["context"]
					.as_u64()
					.ok_or("context-read has no context binding")?;
				let name = self.context_name(context)?;
				let variable = format!("local_{binding}");
				self.uses_ctx = true;
				writeln!(
					self.body,
					"    let {variable} = ctx.read_context({name:?});"
				)
				.unwrap();
				self.locals.insert(binding, variable);
				Ok(())
			}
			"style" => {
				if entry["scoped"].as_bool() == Some(true) {
					return Err("scoped styles not supported yet".to_string());
				}
				let style_id = entry["styleId"].as_str().ok_or("style op has no styleId")?;
				let css = entry["css"]
					.as_str()
					.ok_or("style op without inlined static css")?;
				self.uses_ctx = true;
				writeln!(self.body, "    ctx.register_style({style_id:?}, {css:?});").unwrap();
				Ok(())
			}
			"visible-task" => {
				if entry["strategy"].as_str() != Some("intersection-observer") {
					return Err(format!(
						"visible-task strategy {} not supported yet",
						entry["strategy"]
					));
				}
				let segment = entry["segment"]
					.as_str()
					.ok_or("visible-task op has no segment")?;
				let qrl = self.qrl_expression(segment, true)?;
				let variable = format!("visible_task_{}", self.next_temp());
				// client-only: the body never runs server-side; deps stay empty
				writeln!(
					self.body,
					"    let {variable} = std::rc::Rc::new(qwik::serdes::SerdesValue::Task(\n        qwik::serdes::TaskValue {{ phase: 1, qrl: {qrl}, deps: Vec::new() }},\n    ));"
				)
				.unwrap();
				self.pending_use_on
					.push(("q-e:qvisible".to_string(), variable));
				Ok(())
			}
			// pure microtask timing (`await Promise.resolve()`) — nothing to do natively
			"const" => {
				let binding = entry["binding"].as_u64().ok_or("const op has no local")?;
				let variable = format!("local_{binding}");
				let temp = self.next_temp();
				let tracked = format!("const_tracked_{temp}");
				// setup reads never subscribe — the collector is a throwaway
				let expression =
					self.ir_expression(&entry["init"], &format!("(&mut {tracked})"))?;
				writeln!(
					self.body,
					"    let mut {tracked}: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();\n    \
					 let {variable} = {expression};\n    \
					 let _ = {tracked};"
				)
				.unwrap();
				self.locals.insert(binding, variable);
				self.local_kinds.insert(binding, LocalKind::PlainValue);
				Ok(())
			}
			"render-fn" => {
				if entry["component"].as_bool() != Some(true) {
					return Err("plain render-fn values not supported yet".to_string());
				}
				let name = entry["name"]
					.as_str()
					.ok_or("local component has no name")?;
				self.local_components
					.insert(name.to_string(), entry.clone());
				// the binding's value is the backing QRL — captures serialize it, calls invoke it
				let binding = entry["binding"]
					.as_u64()
					.ok_or("local component has no binding")?;
				let segment_id = entry["segment"]
					.as_str()
					.ok_or("local component has no segment")?
					.to_string();
				let qrl = self.qrl_expression(&segment_id, true)?;
				let variable = format!("local_{binding}");
				writeln!(self.body, "    let {variable} = {qrl};").unwrap();
				self.locals.insert(binding, variable);
				self.local_kinds.insert(binding, LocalKind::PlainValue);
				self.generate_local_component_fn(&entry.clone())
			}
			"statement" => {
				// inert awaits (bare Promise.resolve) have no native effect; plugin-backed
				// statements evaluate synchronously; anything else must provide a plugin
				let ir = entry["value"].clone();
				let is_inert = ir["kind"].as_str() == Some("call")
					&& ir["fn"].as_str() == Some("qwik:promise.resolve")
					&& ir["args"].as_array().is_some_and(|args| args.is_empty());
				if is_inert {
					return Ok(());
				}
				if ir["kind"].as_str() == Some("plugin-call") {
					let call = self.plugin_call_expression(&ir)?;
					writeln!(self.body, "    let _ = {call};").unwrap();
					return Ok(());
				}
				Err(format!("statement expression {ir} requires a plugin"))
			}
			op => Err(format!("setup op {op:?} not supported yet")),
		}
	}

	fn write_ops(&mut self, ops: &[Json], target: &str) -> Result<(), String> {
		for op in ops {
			match op["kind"].as_str().ok_or("op has no kind")? {
				"static" => {
					// pre-escaped at plan emission (compile-time text profile)
					self.statics
						.push_str(op["html"].as_str().ok_or("static op has no html")?);
				}
				"element" => self.write_element(op, target)?,
				"dynamic" => self.write_dynamic(op, target)?,
				"component" => self.write_component(op, target)?,
				"slot" => self.write_slot(op, target)?,
				"branch" => self.write_branch(op, target)?,
				"collection" => self.write_collection(op, target)?,
				"content" => self.write_content(op, target)?,
				"suspense" => self.write_suspense(op, target)?,
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
		let use_on_attrs = std::mem::take(&mut self.pending_use_on);
		let has_events = !use_on_attrs.is_empty()
			|| props.iter().any(|prop| prop["kind"].as_str() == Some("event"));

		let row_root = std::mem::take(&mut self.pending_row_root);
		let id_variable = if op["ssr"]["id"].is_null() {
			None
		} else {
			let plan_id = op["ssr"]["id"].as_u64().ok_or("element id not a number")?;
			// unique suffix: plan ids restart per nested block, and inline expansion shares scope
			let variable = format!("element_id_{plan_id}_{}", self.next_temp());
			self.uses_ctx = true;
			self.flush_statics(target);
			writeln!(self.body, "    let {variable} = ctx.next_id();").unwrap();
			self.element_ids.insert(plan_id, variable.clone());
			Some(variable)
		};
		let id_attr = if row_root {
			" q:id=\\\"{}\\\" q:row"
		} else {
			" q:id=\\\"{}\\\""
		};

		if !has_events {
			self.statics.push('<');
			self.statics.push_str(tag);
			if let Some(variable) = &id_variable {
				self.flush_statics(target);
				writeln!(
					self.body,
					"    {target}.push_str(&format!(\"{id_attr}\", {variable}));"
				)
				.unwrap();
			}
			for prop in props {
				match prop["kind"].as_str().ok_or("prop has no kind")? {
					"dynamic" => self.write_dynamic_attr(prop, target, &id_variable)?,
					_ => self.write_static_prop(prop)?,
				}
			}
			self.statics.push('>');
			if let Some(raw) = Self::inner_html_of(props) {
				self.statics.push_str(&raw);
			}
			self.write_ops(children, target)?;
			if !op["voidTag"].as_bool().unwrap_or(false) {
				self.statics.push_str(&format!("</{tag}>"));
			}
			return Ok(());
		}

		// events resolve at record assembly, AFTER children — QRL roots must follow value roots;
		// attr expressions evaluate (and subscribe) BEFORE children, like the emitted consts
		self.flush_statics(target);
		let mut dynamic_attr_texts: Vec<Option<String>> = Vec::new();
		for prop in props {
			if prop["kind"].as_str() == Some("dynamic") {
				dynamic_attr_texts.push(Some(self.eval_dynamic_attr(prop, &id_variable)?));
			} else {
				dynamic_attr_texts.push(None);
			}
		}
		let has_children = !children.is_empty();
		let children_buffer = format!("children_{}", self.next_temp());
		if has_children {
			writeln!(self.body, "    let mut {children_buffer} = String::new();").unwrap();
			self.write_ops(children, &children_buffer)?;
			self.flush_statics(&children_buffer);
		}

		self.statics.push('<');
		self.statics.push_str(tag);
		self.flush_statics(target);
		if let Some(variable) = &id_variable {
			writeln!(
				self.body,
				"    {target}.push_str(&format!(\"{id_attr}\", {variable}));"
			)
			.unwrap();
		}
		for (attr_name, task_variable) in &use_on_attrs {
			self.uses_ctx = true;
			writeln!(
				self.body,
				"    {target}.push_str(&ctx.use_on_attr({attr_name:?}, std::rc::Rc::clone(&{task_variable})));"
			)
			.unwrap();
		}
		for (prop_index, prop) in props.iter().enumerate() {
			match prop["kind"].as_str().ok_or("prop has no kind")? {
				"event" => self.write_event_prop(prop, target, props)?,
				"dynamic" => {
					let text_variable = dynamic_attr_texts[prop_index]
						.as_ref()
						.expect("dynamic attr evaluated above");
					writeln!(self.body, "    {target}.push_str(&{text_variable});").unwrap();
				}
				_ => {
					self.write_static_prop(prop)?;
					self.flush_statics(target);
				}
			}
		}
		self.statics.push('>');
		self.flush_statics(target);
		if has_children {
			writeln!(self.body, "    {target}.push_str(&{children_buffer});").unwrap();
		}
		if !op["voidTag"].as_bool().unwrap_or(false) {
			self.statics.push_str(&format!("</{tag}>"));
		}
		Ok(())
	}

	fn write_static_prop(&mut self, prop: &Json) -> Result<(), String> {
		match prop["kind"].as_str().ok_or("prop has no kind")? {
			"static" => {
				let name = prop["name"].as_str().ok_or("static prop has no name")?;
				self.statics
					.push_str(&serialize_static_attr(name, &prop["value"])?);
				Ok(())
			}
			// handled at element assembly (raw children), no attribute output
			"inner-html" => Ok(()),
			kind => Err(format!("prop {kind:?} not supported yet")),
		}
	}

	fn inner_html_of(props: &[Json]) -> Option<String> {
		props.iter().find_map(|prop| {
			if prop["kind"].as_str() != Some("inner-html") {
				return None;
			}
			Some(match &prop["html"] {
				Json::String(text) => text.clone(),
				Json::Null => String::new(),
				other => other.to_string(),
			})
		})
	}

	/// Buffered-element form: evaluate (roots + subscription) now, return the variable holding
	/// the rendered ` name="value"` fragment for record assembly after children.
	fn eval_dynamic_attr(
		&mut self,
		prop: &Json,
		id_variable: &Option<String>,
	) -> Result<String, String> {
		let temp = self.next_temp();
		let text_variable = format!("attr_text_{temp}");
		writeln!(self.body, "    let mut {text_variable} = String::new();").unwrap();
		let saved_body = std::mem::take(&mut self.body);
		let result = self.write_dynamic_attr(prop, &text_variable, id_variable);
		let evaluation = std::mem::replace(&mut self.body, saved_body);
		result?;
		self.body.push_str(&evaluation);
		Ok(text_variable)
	}

	fn write_dynamic_attr(
		&mut self,
		prop: &Json,
		target: &str,
		id_variable: &Option<String>,
	) -> Result<(), String> {
		let id_variable = id_variable
			.as_ref()
			.ok_or("dynamic attr on an untargeted element")?;
		let name = prop["name"].as_str().ok_or("dynamic prop has no name")?;
		let ir = &prop["value"]["ir"];
		self.uses_ctx = true;
		self.flush_statics(target);
		// binding reads with a segment are expression attrs (plain values, e.g. props)
		let is_signal_attr = matches!(ir["kind"].as_str(), Some("signal-read"))
			|| (matches!(ir["kind"].as_str(), Some("binding-read"))
				&& prop["value"]["segment"].is_null());
		if is_signal_attr {
			let signal = self.signal_local(ir)?;
			writeln!(
				self.body,
				"    ctx.serializer.add_root(std::rc::Rc::clone(&{signal}));\n    \
				 ctx.subscribe_attr(&{signal}, {id_variable}, {name:?});\n    \
				 {target}.push_str(&qwik::render::dynamic_attr(&{signal}, {name:?}));"
			)
			.unwrap();
			return Ok(());
		}
		// expression attrs (class objects etc.): tracked evaluation + attr-expression effect
		let segment_id = prop["value"]["segment"]
			.as_str()
			.ok_or(format!("dynamic attr {name} without a segment"))?
			.to_string();
		let captures = self.segment_captures(&segment_id)?;
		let mut args = String::new();
		for capture in &captures {
			write!(args, "std::rc::Rc::clone(&{capture}), ").unwrap();
		}
		for capture in &captures {
			writeln!(
				self.body,
				"    ctx.serializer.add_root(std::rc::Rc::clone(&{capture}));"
			)
			.unwrap();
		}
		let temp = self.next_temp();
		let tracked = format!("tracked_{temp}");
		let expression = self.ir_expression(ir, &format!("&mut {tracked}"))?;
		let qrl = self.qrl_expression(&segment_id, false)?;
		writeln!(
			self.body,
			"    let mut {tracked}: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();"
		)
		.unwrap();
		self.track_destructured_props(&segment_id, &format!("&mut {tracked}"))?;
		writeln!(
			self.body,
			"    let attr_value_{temp} = {expression};\n    \
			 if !{tracked}.is_empty() {{\n        \
			 ctx.subscribe_attr_expression(&{tracked}, {id_variable}, {name:?}, vec![{args}], {qrl});\n    \
			 }}\n    \
			 match qwik::render::attr_expression_text({name:?}, &attr_value_{temp}) {{\n        \
			 None => {{}}\n        \
			 Some(text) if text.is_empty() => {target}.push_str(\" {name}\"),\n        \
			 Some(text) => {{\n            \
			 {target}.push_str(\" {name}=\\\"\");\n            \
			 {target}.push_str(&qwik::escape::escape_html(&text));\n            \
			 {target}.push('\\\"');\n        \
			 }}\n    \
			 }}"
		)
		.unwrap();
		Ok(())
	}

	fn sibling_bind_signal(
		&mut self,
		element_props: &[Json],
		bind_name: &str,
	) -> Result<String, String> {
		let sibling = element_props
			.iter()
			.find(|prop| {
				prop["kind"].as_str() == Some("dynamic") && prop["name"].as_str() == Some(bind_name)
			})
			.ok_or(format!("bind handler without a sibling {bind_name:?} prop"))?;
		self.signal_local(&sibling["value"]["ir"])
	}

	fn write_event_prop(
		&mut self,
		prop: &Json,
		target: &str,
		element_props: &[Json],
	) -> Result<(), String> {
		let attr_name = prop["name"].as_str().ok_or("event prop has no name")?;
		let handlers = prop["handlers"]
			.as_array()
			.ok_or("event handlers missing")?;
		let [handler] = handlers.as_slice() else {
			return Err("multi-handler events not supported yet".to_string());
		};
		self.uses_ctx = true;
		let qrl = if let Some(segment_id) = handler["value"]["segment"].as_str() {
			let segment_id = segment_id.to_string();
			if self.segment(&segment_id)?["kind"].as_str() == Some("expression") {
				// non-function handler (props.onClick$): evaluate the expression for the QRL
				let ir = handler["value"]["ir"].clone();
				return self.write_event_expression(attr_name, &segment_id, &ir, target);
			}
			self.qrl_expression(&segment_id, true)?
		} else if handler["bind"].is_string() {
			// bind rides the built-in _val/_chk handler capturing the bound signal
			let symbol = if attr_name == "q-e:input" {
				"_val"
			} else {
				"_chk"
			};
			let bind_name = if symbol == "_val" { "value" } else { "checked" };
			let bound = self.sibling_bind_signal(element_props, bind_name)?;
			format!(
				"std::rc::Rc::new(qwik::serdes::SerdesValue::Qrl(qwik::serdes::QrlValue {{\n        chunk: \"mock-chunk\".to_string(), symbol: {symbol:?}.to_string(), captures: vec![std::rc::Rc::clone(&{bound})],\n    }}))"
			)
		} else {
			return Err("event handler without a segment or bind".to_string());
		};
		writeln!(
			self.body,
			"    {target}.push_str(&ctx.event_attr({attr_name:?}, {qrl}));"
		)
		.unwrap();
		Ok(())
	}

	/// Evaluate an expression-kind event handler (renderSsrEvent semantics): the tracked
	/// evaluation yields the handler QRL value; null/undefined renders no attribute.
	fn write_event_expression(
		&mut self,
		attr_name: &str,
		segment_id: &str,
		ir: &Json,
		target: &str,
	) -> Result<(), String> {
		if ir.is_null() {
			return Err(format!("event handler expression {segment_id} has no ir"));
		}
		for capture in self.segment_captures(segment_id)? {
			writeln!(
				self.body,
				"    ctx.serializer.add_root(std::rc::Rc::clone(&{capture}));"
			)
			.unwrap();
		}
		let temp = self.next_temp();
		let tracked = format!("tracked_{temp}");
		let expression = self.ir_expression(ir, &format!("&mut {tracked}"))?;
		writeln!(
			self.body,
			"    let mut {tracked}: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();"
		)
		.unwrap();
		self.track_destructured_props(segment_id, &format!("&mut {tracked}"))?;
		writeln!(
			self.body,
			"    let event_value_{temp} = {expression};\n    \
			 if !{tracked}.is_empty() {{\n        \
			 panic!(\"tracked event handler expressions not supported yet\");\n    \
			 }}\n    \
			 if !matches!(&*event_value_{temp}, qwik::serdes::SerdesValue::Undefined | qwik::serdes::SerdesValue::Null) {{\n        \
			 {target}.push_str(&ctx.event_attr({attr_name:?}, event_value_{temp}));\n    \
			 }}"
		)
		.unwrap();
		Ok(())
	}

	fn write_component(&mut self, op: &Json, target: &str) -> Result<(), String> {
		if op["target"].as_str().is_some() {
			return self.write_local_component_call(op, target);
		}
		let reference = op["target"]["ref"]
			.as_u64()
			.ok_or("component op is not linked to a ref")? as usize;
		if !op["propsSource"].is_null() {
			return Err("component propsSource not supported yet".to_string());
		}
		self.flush_statics(target);
		self.uses_ctx = true;

		let call_props = op["props"]
			.as_array()
			.ok_or("component props missing")?
			.clone();
		let spread_local = self.spread_props_expression(&call_props)?;
		let mut statics_entries = String::new();
		let mut sources_entries = String::new();
		let mut source_locals = Vec::new();
		let no_props: Vec<Json> = Vec::new();
		for prop in if spread_local.is_some() {
			&no_props
		} else {
			&call_props
		} {
			match prop["kind"].as_str().ok_or("prop has no kind")? {
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
					if ir["kind"].as_str() != Some("signal-read") {
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
				"event" => {
					// event props pass the handler QRL as a plain prop value (q_….w(captures))
					let name = prop["name"].as_str().ok_or("event prop has no name")?;
					let handlers = prop["handlers"]
						.as_array()
						.ok_or("event handlers missing")?;
					let [handler] = handlers.as_slice() else {
						return Err("multi-handler component event props not supported yet".into());
					};
					let segment_id = handler["value"]["segment"]
						.as_str()
						.ok_or("component event prop without a segment")?
						.to_string();
					let qrl = self.qrl_expression(&segment_id, true)?;
					write!(statics_entries, "({name:?}.to_string(), {qrl}), ").unwrap();
				}
				kind => return Err(format!("component prop {kind:?} not supported yet")),
			}
		}

		let child_function = render_function_name(self.plan, reference)?;
		let child_takes_props = component_has_props(self.plan, reference);
		let child_takes_slots = component_uses_slots(self.plan, reference);
		let target_argument = if target == "out" {
			"out".to_string()
		} else {
			format!("&mut {target}")
		};

		// slot scope + projections root first, then each slot's captures
		let slots = op["slots"].as_array().ok_or("component slots missing")?;
		let mut slot_closures: Vec<(String, String)> = Vec::new();
		if !slots.is_empty() {
			let scope_variable = format!("slot_scope_{}", self.next_temp());
			let mut projection_entries = String::new();
			for slot in slots {
				if !slot["idBase"].is_null() {
					return Err("slot idBase not supported yet".to_string());
				}
				let slot_name = slot["name"].as_str().ok_or("slot has no name")?;
				let segment_id = slot["render"]["segment"]
					.as_str()
					.ok_or("slot render without a segment")?;
				let render_qrl = self.qrl_expression(segment_id, true)?;
				write!(
					projection_entries,
					"({slot_name:?}.to_string(), vec![std::rc::Rc::new(qwik::serdes::SerdesValue::Projection(qwik::serdes::ProjectionValue {{ render_qrl: {render_qrl}, slot_scope: None, id_base: String::new() }}))]), "
				)
				.unwrap();
			}
			writeln!(
				self.body,
				"    let {scope_variable} = std::rc::Rc::new(qwik::serdes::SerdesValue::SlotScope(\n        std::cell::RefCell::new(qwik::serdes::SlotScopeState {{ projections: vec![{projection_entries}] }}),\n    ));\n    \
				 ctx.serializer.add_root(std::rc::Rc::clone(&{scope_variable}));"
			)
			.unwrap();
			for slot in slots {
				let segment_id = slot["render"]["segment"].as_str().unwrap();
				for capture in self.segment_captures(segment_id)? {
					writeln!(
						self.body,
						"    ctx.serializer.add_root(std::rc::Rc::clone(&{capture}));"
					)
					.unwrap();
				}
				let slot_name = slot["name"].as_str().unwrap().to_string();
				let ops = slot["render"]["ops"]
					.as_array()
					.ok_or("slot render ops missing")?
					.clone();
				let closure_body = self.render_fn_body(&ops)?;
				slot_closures.push((slot_name, closure_body));
			}
		}

		// dynamic prop sources become state roots when the component is created
		for signal in &source_locals {
			writeln!(
				self.body,
				"    ctx.serializer.add_root(std::rc::Rc::clone(&{signal}));"
			)
			.unwrap();
		}
		let mut slots_argument = String::new();
		if child_takes_slots {
			let mut table = String::new();
			for (slot_name, closure_body) in &slot_closures {
				let closure_variable = format!("slot_fn_{}", self.next_temp());
				writeln!(
					self.body,
					"    let mut {closure_variable} = |ctx: &mut qwik::render::SsrContext, out: &mut String| {{\n{closure_body}    }};"
				)
				.unwrap();
				write!(table, "({slot_name:?}, &mut {closure_variable} as &mut dyn FnMut(&mut qwik::render::SsrContext, &mut String)), ").unwrap();
			}
			slots_argument = format!(", &mut [{table}]");
		} else if !slot_closures.is_empty() {
			return Err("slots passed to a component without slot ops".to_string());
		}
		if !child_takes_props {
			writeln!(
				self.body,
				"    ctx.push_component_owner();\n    \
				 {child_function}(ctx, {target_argument}{slots_argument});\n    \
				 ctx.pop_component_owner();"
			)
			.unwrap();
			return Ok(());
		}
		let props_variable = format!("props_{}", self.next_temp());
		if let Some(spread) = &spread_local {
			writeln!(self.body, "    let {props_variable} = {spread};").unwrap();
		} else if source_locals.is_empty() {
			// static-only props pass as a bare object literal (no Props record)
			writeln!(
				self.body,
				"    let {props_variable} = std::rc::Rc::new(qwik::serdes::SerdesValue::Object(vec![{statics_entries}]));"
			)
			.unwrap();
		} else {
			writeln!(
				self.body,
				"    let {props_variable} = std::rc::Rc::new(qwik::serdes::SerdesValue::Props(\n        qwik::serdes::PropsValue {{ statics: vec![{statics_entries}], sources: vec![{sources_entries}] }},\n    ));"
			)
			.unwrap();
		}
		writeln!(
			self.body,
			"    ctx.push_component_owner();\n    \
			 {child_function}(ctx, {target_argument}, &{props_variable}{slots_argument});\n    \
			 ctx.pop_component_owner();"
		)
		.unwrap();
		Ok(())
	}

	/// Inline a local component at its call site: bind destructured props, then expand the
	/// block in a child scope. Runtime semantics are identical to the emitted call because all
	/// byte-observable work goes through explicit ctx calls.
	/// Spread-mode props: segments group literal runs between spreads and merge in order
	/// (`mergeProps`); a sole segment passes through. `None` when the list has no spread.
	fn spread_props_expression(&mut self, call_props: &[Json]) -> Result<Option<String>, String> {
		if !call_props
			.iter()
			.any(|prop| prop["kind"].as_str() == Some("spread"))
		{
			return Ok(None);
		}
		let mut segments: Vec<String> = Vec::new();
		let mut sources: Vec<(String, String)> = Vec::new();
		let mut literal_run: Option<String> = None;
		for prop in call_props {
			match prop["kind"].as_str().ok_or("prop has no kind")? {
				"spread" => {
					let ir = &prop["value"]["ir"];
					if ir["kind"].as_str() != Some("binding-read") {
						return Err(format!("spread props ir {ir} not supported yet"));
					}
					let source = self.local(ir["binding"].as_u64().ok_or("no binding")?)?;
					if let Some(entries) = literal_run.take() {
						segments.push(format!(
							"std::rc::Rc::new(qwik::serdes::SerdesValue::Object(vec![{entries}]))"
						));
					}
					segments.push(format!("std::rc::Rc::clone(&{source})"));
				}
				"static" => {
					let name = prop["name"].as_str().ok_or("static prop has no name")?;
					let value = json_literal_expression(&prop["value"])?;
					let entries = literal_run.get_or_insert_with(String::new);
					write!(
						entries,
						"({name:?}.to_string(), std::rc::Rc::new({value})), "
					)
					.unwrap();
				}
				"dynamic" => {
					let ir = &prop["value"]["ir"];
					if ir["kind"].as_str() != Some("signal-read") {
						return Err(format!("prop ir {ir} mixed with spreads not supported yet"));
					}
					// signal reads merge as live values; _props records their sources
					let name = prop["name"].as_str().ok_or("dynamic prop has no name")?;
					let source = self.signal_local(ir)?;
					let entries = literal_run.get_or_insert_with(String::new);
					write!(
						entries,
						"({name:?}.to_string(), qwik::render::tracked_signal_value(&{source}, &mut Vec::new())), "
					)
					.unwrap();
					sources.push((name.to_string(), source));
				}
				kind => {
					return Err(format!(
						"prop kind {kind:?} mixed with spreads not supported yet"
					))
				}
			}
		}
		if let Some(entries) = literal_run.take() {
			segments.push(format!(
				"std::rc::Rc::new(qwik::serdes::SerdesValue::Object(vec![{entries}]))"
			));
		}
		let merged = if segments.len() == 1 {
			segments.remove(0)
		} else {
			let list = segments.join(", ");
			format!("qwik::render::merge_props(&[{list}])")
		};
		if sources.is_empty() {
			return Ok(Some(merged));
		}
		for (_, source) in &sources {
			writeln!(
				self.body,
				"    ctx.serializer.add_root(std::rc::Rc::clone(&{source}));"
			)
			.unwrap();
		}
		let mut sources_entries = String::new();
		for (name, source) in &sources {
			write!(
				sources_entries,
				"({name:?}.to_string(), std::rc::Rc::clone(&{source})), "
			)
			.unwrap();
		}
		Ok(Some(format!(
			"qwik::render::props_from(&{merged}, vec![{sources_entries}])"
		)))
	}

	fn write_local_component_call(&mut self, op: &Json, target: &str) -> Result<(), String> {
		let name = op["target"]
			.as_str()
			.ok_or("local component target is not a name")?;
		let entry = self
			.local_components
			.get(name)
			.cloned()
			.ok_or_else(|| format!("local component {name:?} is not in scope"))?;
		if !op["propsSource"].is_null() {
			return Err("local component propsSource not supported yet".to_string());
		}
		self.flush_statics(target);
		self.uses_ctx = true;
		let binding = entry["binding"]
			.as_u64()
			.ok_or("local component has no binding")?;
		let segment_id = entry["segment"]
			.as_str()
			.ok_or("local component has no segment")?;
		let symbol = rust_fn_name(
			self.segment(segment_id)?["symbolName"]
				.as_str()
				.ok_or("segment has no symbol")?,
		);
		let takes_slots = *self
			.segment_fn_takes_slots
			.get(&symbol)
			.ok_or_else(|| format!("local component fn {symbol:?} not generated"))?;
		// slot scope + projections mirror write_component; closures render the projected children
		let slots = op["slots"].as_array().ok_or("component slots missing")?;
		if !slots.is_empty() && !takes_slots {
			return Err("slots passed to a local component without slot ops".to_string());
		}
		let mut slot_closures: Vec<(String, String)> = Vec::new();
		if !slots.is_empty() {
			let scope_variable = format!("slot_scope_{}", self.next_temp());
			let mut projection_entries = String::new();
			for slot in slots {
				if !slot["idBase"].is_null() {
					return Err("slot idBase not supported yet".to_string());
				}
				let slot_name = slot["name"].as_str().ok_or("slot has no name")?;
				let projection_segment = slot["render"]["segment"]
					.as_str()
					.ok_or("slot render without a segment")?;
				let render_qrl = self.qrl_expression(projection_segment, true)?;
				write!(
					projection_entries,
					"({slot_name:?}.to_string(), vec![std::rc::Rc::new(qwik::serdes::SerdesValue::Projection(qwik::serdes::ProjectionValue {{ render_qrl: {render_qrl}, slot_scope: None, id_base: String::new() }}))]), "
				)
				.unwrap();
			}
			writeln!(
				self.body,
				"    let {scope_variable} = std::rc::Rc::new(qwik::serdes::SerdesValue::SlotScope(\n        std::cell::RefCell::new(qwik::serdes::SlotScopeState {{ projections: vec![{projection_entries}] }}),\n    ));\n    \
				 ctx.serializer.add_root(std::rc::Rc::clone(&{scope_variable}));"
			)
			.unwrap();
			for slot in slots {
				let projection_segment = slot["render"]["segment"].as_str().unwrap();
				for capture in self.segment_captures(projection_segment)? {
					writeln!(
						self.body,
						"    ctx.serializer.add_root(std::rc::Rc::clone(&{capture}));"
					)
					.unwrap();
				}
				let slot_name = slot["name"].as_str().unwrap().to_string();
				let ops = slot["render"]["ops"]
					.as_array()
					.ok_or("slot render ops missing")?
					.clone();
				let closure_body = self.render_fn_body(&ops)?;
				slot_closures.push((slot_name, closure_body));
			}
		}
		let mut slots_argument = String::new();
		if takes_slots {
			let mut table = String::new();
			for (slot_name, closure_body) in &slot_closures {
				let closure_variable = format!("slot_fn_{}", self.next_temp());
				writeln!(
					self.body,
					"    let mut {closure_variable} = |ctx: &mut qwik::render::SsrContext, out: &mut String| {{\n{closure_body}    }};"
				)
				.unwrap();
				write!(table, "({slot_name:?}, &mut {closure_variable} as &mut dyn FnMut(&mut qwik::render::SsrContext, &mut String)), ").unwrap();
			}
			slots_argument = format!(", &mut [{table}]");
		}
		// props mirror the emitted literal: plain values inline; signal reads become sources
		// (`_props(literal, sources)`), rooted like any component call's reactive props
		let call_props = op["props"]
			.as_array()
			.ok_or("component props missing")?
			.clone();
		let spread_local = self.spread_props_expression(&call_props)?;
		let mut entries = String::new();
		let mut sources_entries = String::new();
		let mut source_locals = Vec::new();
		let no_props: Vec<Json> = Vec::new();
		for prop in if spread_local.is_some() {
			&no_props
		} else {
			&call_props
		} {
			let prop_name = prop["name"].as_str().ok_or("prop has no name")?;
			match prop["kind"].as_str().ok_or("prop has no kind")? {
				"static" => {
					let value = json_literal_expression(&prop["value"])?;
					write!(
						entries,
						"({prop_name:?}.to_string(), std::rc::Rc::new({value})), "
					)
					.unwrap();
				}
				"dynamic" => {
					let ir = &prop["value"]["ir"];
					match ir["kind"].as_str() {
						Some("binding-read") => {
							let source = self.local(ir["binding"].as_u64().ok_or("no binding")?)?;
							write!(
								entries,
								"({prop_name:?}.to_string(), std::rc::Rc::clone(&{source})), "
							)
							.unwrap();
						}
						Some("signal-read") => {
							let source = self.signal_local(ir)?;
							write!(
								sources_entries,
								"({prop_name:?}.to_string(), std::rc::Rc::clone(&{source})), "
							)
							.unwrap();
							source_locals.push(source);
						}
						_ => return Err(format!("local component prop ir {ir} not supported yet")),
					}
				}
				kind => return Err(format!("local component prop {kind:?} not supported yet")),
			}
		}
		for source in &source_locals {
			writeln!(
				self.body,
				"    ctx.serializer.add_root(std::rc::Rc::clone(&{source}));"
			)
			.unwrap();
		}
		let temp = self.next_temp();
		let qrl_local = self.local(binding)?;
		let target_argument = if target == "out" {
			"out".to_string()
		} else {
			format!("&mut {target}")
		};
		// static-only props pass as a bare object literal; sources promote to a Props record
		let props_value = if let Some(spread) = &spread_local {
			spread.clone()
		} else if source_locals.is_empty() {
			format!("std::rc::Rc::new(qwik::serdes::SerdesValue::Object(vec![{entries}]))")
		} else {
			format!(
				"std::rc::Rc::new(qwik::serdes::SerdesValue::Props(\n        qwik::serdes::PropsValue {{ statics: vec![{entries}], sources: vec![{sources_entries}] }},\n    ))"
			)
		};
		// invoke through the QRL value: the component value carries its captures
		writeln!(
			self.body,
			"    let props_{temp} = {props_value};\n    \
			 ctx.push_component_owner();\n    \
			 {symbol}(ctx, {target_argument}, &props_{temp}{slots_argument}, qwik::render::qrl_captures(&{qrl_local}));\n    \
			 ctx.pop_component_owner();"
		)
		.unwrap();
		Ok(())
	}

	/// Generate the standalone fn for a local component: same body machinery as any component,
	/// with capture rebinds mirroring the JS chunk's `const x = _captures[i]` preamble.
	fn generate_local_component_fn(&mut self, entry: &Json) -> Result<(), String> {
		let segment_id = entry["segment"]
			.as_str()
			.ok_or("local component has no segment")?
			.to_string();
		let props_plan = &entry["props"];
		self.generate_segment_fn(
			&segment_id,
			&entry["render"].clone(),
			SegmentFnKind::LocalComponent(props_plan.clone()),
		)
		.map(|_| ())
	}

	/// One fn per segment symbol (specs/07 QRL invocation convention): shared body machinery,
	/// per-kind signature head, `captures` always the trailing parameter. Returns the symbol.
	fn generate_segment_fn(
		&mut self,
		segment_id: &str,
		render_fn: &Json,
		kind: SegmentFnKind,
	) -> Result<String, String> {
		let segment = self.segment(segment_id)?.clone();
		let symbol = segment["symbolName"]
			.as_str()
			.ok_or("segment has no symbol")?
			.to_string();
		let symbol = rust_fn_name(&symbol);
		let mut child = ComponentGenerator {
			plan: self.plan,
			module_index: self.module_index,
			body: String::new(),
			statics: String::new(),
			locals: HashMap::new(),
			local_kinds: HashMap::new(),
			computed_fns: self.computed_fns.clone(),
			pending_row_root: false,
			pending_use_on: Vec::new(),
			provided_contexts: Vec::new(),
			local_components: self.local_components.clone(),
			pending_segment_fns: Vec::new(),
			segment_fn_takes_slots: self.segment_fn_takes_slots.clone(),
			destructured_props: false,
			element_ids: HashMap::new(),
			temp_counter: 0,
			uses_ctx: false,
			uses_props: false,
			uses_slots: false,
		};
		for (position, capture) in segment["captures"]
			.as_array()
			.ok_or("segment captures missing")?
			.iter()
			.enumerate()
		{
			let binding = capture["binding"]
				.as_u64()
				.ok_or("capture has no binding")?;
			let name = capture["name"].as_str().ok_or("capture has no name")?;
			let variable = format!("capture_{name}");
			writeln!(
				child.body,
				"    let {variable} = std::rc::Rc::clone(&captures[{position}]);"
			)
			.unwrap();
			child.locals.insert(binding, variable);
			if let Some(kind) = self.local_kinds.get(&binding) {
				child.local_kinds.insert(binding, *kind);
			}
		}
		if let SegmentFnKind::LocalComponent(props_plan) = &kind {
			if props_plan["kind"].as_str() == Some("identifier") {
				// whole-object form: the binding is the props value itself
				let binding = props_plan["binding"]
					.as_u64()
					.ok_or("identifier props without a binding")?;
				writeln!(
					child.body,
					"    let props_local = std::rc::Rc::clone(props);"
				)
				.unwrap();
				child.locals.insert(binding, "props_local".to_string());
				child.local_kinds.insert(binding, LocalKind::PlainValue);
			}
			if let Some(bindings) = props_plan["bindings"].as_array() {
				for binding_entry in bindings {
					let binding = binding_entry["binding"]
						.as_u64()
						.ok_or("prop binding not a number")?;
					let prop_name = binding_entry["name"]
						.as_str()
						.ok_or("prop binding has no name")?;
					let variable = format!("prop_{binding}");
					writeln!(
						child.body,
						"    let {variable} = qwik::render::props_value(props, {prop_name:?});"
					)
					.unwrap();
					child.locals.insert(binding, variable);
					child.local_kinds.insert(binding, LocalKind::PlainValue);
				}
			}
		}
		if let SegmentFnKind::CollectionRow {
			param_bindings,
			uses_index_signal,
		} = &kind
		{
			if let Some(item_binding) = param_bindings.first() {
				writeln!(
					child.body,
					"    let row_item_local = std::rc::Rc::clone(row_item);"
				)
				.unwrap();
				child
					.locals
					.insert(*item_binding, "row_item_local".to_string());
				child
					.local_kinds
					.insert(*item_binding, LocalKind::PlainValue);
			}
			if *uses_index_signal {
				if let Some(index_binding) = param_bindings.get(1) {
					writeln!(
						child.body,
						"    let row_index_local = std::rc::Rc::clone(row_index);"
					)
					.unwrap();
					child
						.locals
						.insert(*index_binding, "row_index_local".to_string());
					child
						.local_kinds
						.insert(*index_binding, LocalKind::IndexSignal);
				}
			}
			// the row's root element carries the q:row attribute
			child.pending_row_root = true;
		}
		for setup_entry in render_fn["setup"]
			.as_array()
			.ok_or("render setup missing")?
		{
			child.write_setup(setup_entry)?;
		}
		// a providing block wraps its output in a context-scope range, like a provider component
		let provided = std::mem::take(&mut child.provided_contexts);
		if !provided.is_empty() {
			let mut entries = String::new();
			for (name, value) in &provided {
				write!(
					entries,
					"({name:?}.to_string(), std::rc::Rc::clone(&{value})), "
				)
				.unwrap();
			}
			child.uses_ctx = true;
			writeln!(
				child.body,
				"    let context_scope = std::rc::Rc::new(qwik::serdes::SerdesValue::ContextScope(\n        std::cell::RefCell::new(qwik::serdes::ContextScopeState {{ parent: ctx.current_context(), entries: vec![{entries}] }}),\n    ));\n    \
				 let context_scope_root = ctx.serializer.add_root(std::rc::Rc::clone(&context_scope));\n    \
				 ctx.push_context(context_scope);\n    \
				 out.push_str(&format!(\"<!c={{}}>\", context_scope_root));"
			)
			.unwrap();
		}
		child.write_ops(
			render_fn["ops"].as_array().ok_or("render ops missing")?,
			"out",
		)?;
		child.flush_statics("out");
		if !provided.is_empty() {
			writeln!(
				child.body,
				"    out.push_str(\"<!/c>\");\n    ctx.pop_context();"
			)
			.unwrap();
		}
		if !child.pending_use_on.is_empty() {
			return Err("pending use-on in segment fns not supported yet".to_string());
		}
		let body = child.body;
		self.pending_segment_fns.extend(child.pending_segment_fns);
		if child.uses_slots && !matches!(kind, SegmentFnKind::LocalComponent(_)) {
			return Err("slots outside a local component body not supported yet".to_string());
		}
		let slots_param = if child.uses_slots {
			", slots: &mut [(&str, &mut dyn FnMut(&mut qwik::render::SsrContext, &mut String))]"
		} else {
			""
		};
		self.segment_fn_takes_slots
			.insert(symbol.clone(), child.uses_slots);
		let head = match &kind {
			SegmentFnKind::LocalComponent(_) => format!(
				"fn {symbol}(ctx: &mut qwik::render::SsrContext, out: &mut String, props: &std::rc::Rc<qwik::serdes::SerdesValue>{slots_param}, captures: &[std::rc::Rc<qwik::serdes::SerdesValue>])"
			),
			SegmentFnKind::BranchArm => format!(
				"fn {symbol}(ctx: &mut qwik::render::SsrContext, out: &mut String, captures: &[std::rc::Rc<qwik::serdes::SerdesValue>])"
			),
			SegmentFnKind::CollectionRow {
				uses_index_signal, ..
			} => {
				let index_param = if *uses_index_signal {
					", row_index: &std::rc::Rc<qwik::serdes::SerdesValue>"
				} else {
					""
				};
				format!(
					"fn {symbol}(ctx: &mut qwik::render::SsrContext, out: &mut String, row_item: &std::rc::Rc<qwik::serdes::SerdesValue>{index_param}, captures: &[std::rc::Rc<qwik::serdes::SerdesValue>])"
				)
			}
		};
		self.pending_segment_fns
			.push(format!("{head} {{\n{body}}}\n"));
		Ok(symbol)
	}

	/// Value-segment fn (computed bodies, branch conditions, derived sources):
	/// `(tracked, captures) -> value`, mirroring the JS chunk's `() => value` with `_captures`.
	fn generate_value_fn(&mut self, segment_id: &str, ir: &Json) -> Result<String, String> {
		let segment = self.segment(segment_id)?.clone();
		let symbol = segment["symbolName"]
			.as_str()
			.ok_or("segment has no symbol")?
			.to_string();
		let symbol = rust_fn_name(&symbol);
		let mut child = ComponentGenerator {
			plan: self.plan,
			module_index: self.module_index,
			body: String::new(),
			statics: String::new(),
			locals: HashMap::new(),
			local_kinds: HashMap::new(),
			computed_fns: self.computed_fns.clone(),
			pending_row_root: false,
			pending_use_on: Vec::new(),
			provided_contexts: Vec::new(),
			local_components: self.local_components.clone(),
			pending_segment_fns: Vec::new(),
			segment_fn_takes_slots: self.segment_fn_takes_slots.clone(),
			destructured_props: false,
			element_ids: HashMap::new(),
			temp_counter: 0,
			uses_ctx: false,
			uses_props: false,
			uses_slots: false,
		};
		for (position, capture) in segment["captures"]
			.as_array()
			.ok_or("segment captures missing")?
			.iter()
			.enumerate()
		{
			let binding = capture["binding"]
				.as_u64()
				.ok_or("capture has no binding")?;
			let name = capture["name"].as_str().ok_or("capture has no name")?;
			let variable = format!("capture_{name}");
			writeln!(
				child.body,
				"    let {variable} = std::rc::Rc::clone(&captures[{position}]);"
			)
			.unwrap();
			child.locals.insert(binding, variable);
			if let Some(kind) = self.local_kinds.get(&binding) {
				child.local_kinds.insert(binding, *kind);
			}
		}
		let expression = child.ir_expression(ir, "tracked")?;
		let body = child.body;
		self.pending_segment_fns.extend(child.pending_segment_fns);
		self.pending_segment_fns.push(format!(
			"fn {symbol}(tracked: &mut Vec<std::rc::Rc<qwik::serdes::SerdesValue>>, captures: &[std::rc::Rc<qwik::serdes::SerdesValue>]) -> std::rc::Rc<qwik::serdes::SerdesValue> {{\n{body}    {expression}\n}}\n"
		));
		Ok(symbol)
	}

	fn write_slot(&mut self, op: &Json, target: &str) -> Result<(), String> {
		if !op["ssr"]["idBase"].is_null() {
			return Err("slot idBase not supported yet".to_string());
		}
		let name = op["name"].as_str().ok_or("slot has no name")?;
		self.uses_ctx = true;
		self.uses_slots = true;
		self.flush_statics(target);
		let temp = self.next_temp();
		let range = format!("slot_range_{temp}");
		let out_argument = if target == "out" {
			"out".to_string()
		} else {
			format!("&mut {target}")
		};
		// fallback: captures root unconditionally (emitted prep); the content renders only
		// when no projection is registered, and nothing about it serializes
		let fallback_call = if op["fallback"].is_null() {
			String::new()
		} else {
			let fallback_segment = op["fallback"]["segment"]
				.as_str()
				.ok_or("slot fallback has no segment")?
				.to_string();
			for capture in self.segment_captures(&fallback_segment)? {
				writeln!(
					self.body,
					"    ctx.serializer.add_root(std::rc::Rc::clone(&{capture}));"
				)
				.unwrap();
			}
			let fallback_qrl = self.qrl_expression(&fallback_segment, true)?;
			let fallback_symbol = self.generate_segment_fn(
				&fallback_segment,
				&op["fallback"].clone(),
				SegmentFnKind::BranchArm,
			)?;
			writeln!(self.body, "    let fallback_qrl_{temp} = {fallback_qrl};").unwrap();
			format!(
				" else {{\n        {fallback_symbol}(ctx, {out_argument}, qwik::render::qrl_captures(&fallback_qrl_{temp}));\n    }}"
			)
		};
		writeln!(
			self.body,
			"    let {range} = ctx.next_id();\n    \
			 {target}.push_str(&format!(\"<!s={{}}>\", {range}));\n    \
			 if let Some((_, render_slot)) = slots.iter_mut().find(|(name, _)| *name == {name:?}) {{\n        \
			 render_slot(ctx, {out_argument});\n    \
			 }}{fallback_call}\n    \
			 {target}.push_str(\"<!/s>\");"
		)
		.unwrap();
		Ok(())
	}

	/// Generate a nested render function's body (slot projections) in a fresh element scope.
	fn render_fn_body(&mut self, ops: &[Json]) -> Result<String, String> {
		let saved_body = std::mem::take(&mut self.body);
		let saved_statics = std::mem::take(&mut self.statics);
		let saved_elements = std::mem::take(&mut self.element_ids);
		let result = self.write_ops(ops, "out").map(|()| {
			self.flush_statics("out");
			self.body.clone()
		});
		self.body = saved_body;
		self.statics = saved_statics;
		self.element_ids = saved_elements;
		result
	}

	fn write_branch(&mut self, op: &Json, target: &str) -> Result<(), String> {
		if !op["ssr"]["idBase"].is_null() {
			return Err("branch idBase not supported yet".to_string());
		}
		let condition_ir = &op["conditionIr"];
		if condition_ir.is_null() {
			return Err("branch without a lowered condition".to_string());
		}
		let condition_segment = op["condition"]
			.as_str()
			.ok_or("branch has no condition segment")?;
		let then_segment = op["then"]["segment"]
			.as_str()
			.ok_or("branch then arm has no segment")?
			.to_string();
		let else_fn = &op["else"];
		self.uses_ctx = true;
		self.flush_statics(target);
		let temp = self.next_temp();
		let range = format!("branch_range_{temp}");
		let tracked = format!("tracked_{temp}");
		let effect = format!("branch_effect_{temp}");
		writeln!(self.body, "    let {range} = ctx.next_id();").unwrap();
		writeln!(
			self.body,
			"    {target}.push_str(&format!(\"<!b={{}}>\", {range}));"
		)
		.unwrap();
		for capture in self.segment_captures(condition_segment)? {
			writeln!(
				self.body,
				"    ctx.serializer.add_root(std::rc::Rc::clone(&{capture}));"
			)
			.unwrap();
		}
		// emitted prep also roots the arm captures (rootSegments([then, else]))
		let mut arm_segments = vec![then_segment.clone()];
		if let Some(else_segment) = else_fn["segment"].as_str() {
			arm_segments.push(else_segment.to_string());
		}
		for arm_segment in &arm_segments {
			for capture in self.segment_captures(arm_segment)? {
				writeln!(
					self.body,
					"    ctx.serializer.add_root(std::rc::Rc::clone(&{capture}));"
				)
				.unwrap();
			}
		}
		let condition_symbol = self.generate_value_fn(condition_segment, &condition_ir.clone())?;
		let condition_qrl = self.qrl_expression(condition_segment, true)?;
		let then_qrl = self.qrl_expression(&then_segment, true)?;
		let then_symbol =
			self.generate_segment_fn(&then_segment, &op["then"], SegmentFnKind::BranchArm)?;
		let else_arm = match else_fn["segment"].as_str() {
			Some(else_segment) => {
				let else_segment = else_segment.to_string();
				let qrl = self.qrl_expression(&else_segment, true)?;
				let symbol =
					self.generate_segment_fn(&else_segment, else_fn, SegmentFnKind::BranchArm)?;
				Some((qrl, symbol))
			}
			None => None,
		};
		let target_argument = if target == "out" {
			"out".to_string()
		} else {
			format!("&mut {target}")
		};
		let else_qrl_argument = match &else_arm {
			Some(_) => format!("Some(std::rc::Rc::clone(&else_qrl_{temp}))"),
			None => "None".to_string(),
		};
		if let Some((else_qrl, _)) = &else_arm {
			writeln!(self.body, "    let else_qrl_{temp} = {else_qrl};").unwrap();
		}
		writeln!(
			self.body,
			"    let then_qrl_{temp} = {then_qrl};\n    \
			 let condition_qrl_{temp} = {condition_qrl};\n    \
			 let mut {tracked}: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();\n    \
			 let branch_taken_{temp} = qwik::render::truthy(&{condition_symbol}(&mut {tracked}, qwik::render::qrl_captures(&condition_qrl_{temp})));\n    \
			 let {effect} = ctx.create_branch_effect({range}, if branch_taken_{temp} {{ 0 }} else {{ 1 }}, {tracked}.clone(), std::rc::Rc::clone(&condition_qrl_{temp}), std::rc::Rc::clone(&then_qrl_{temp}), {else_qrl_argument});\n    \
			 ctx.push_owner();"
		)
		.unwrap();
		// arms invoke through their QRL values (specs/07 invocation convention)
		writeln!(
			self.body,
			"    if branch_taken_{temp} {{\n        \
			 {then_symbol}(ctx, {target_argument}, qwik::render::qrl_captures(&then_qrl_{temp}));\n    \
			 }} else {{"
		)
		.unwrap();
		if let Some((_, else_symbol)) = &else_arm {
			writeln!(
				self.body,
				"        {else_symbol}(ctx, {target_argument}, qwik::render::qrl_captures(&else_qrl_{temp}));"
			)
			.unwrap();
		}
		writeln!(self.body, "    }}").unwrap();
		writeln!(
			self.body,
			"    qwik::render::SsrContext::set_branch_owner_items(&{effect}, ctx.pop_owner());"
		)
		.unwrap();
		self.statics.push_str("<!/b>");
		Ok(())
	}

	/// Generate a nested render fn's ops inline (fresh element-id scope, same output target).
	/// Static collections (literal arrays) render rows in a plain loop: no id, no range
	/// markers, no For effect and no owner arrays — nothing about them reaches the state.
	fn write_static_collection(&mut self, op: &Json, target: &str) -> Result<(), String> {
		let row = &op["row"];
		if row["symbolName"].as_str().is_none() {
			return Err("direct-array collections need an inline row".to_string());
		}
		for flag in ["rowMarker", "slotMarker", "rowRoot", "usesRowId"] {
			if row[flag].as_bool() == Some(true) {
				return Err(format!("inline row {flag} not supported yet"));
			}
		}
		if op["usesIndexSignal"].as_bool() == Some(true) {
			return Err("index signals on static collections not supported yet".to_string());
		}
		if !op["key"].is_null() {
			return Err("keys on static collections not supported yet".to_string());
		}
		let ir = &source_ir_of(op)?;
		if ir["kind"].as_str() != Some("array") {
			return Err("static collection source must be an array literal".to_string());
		}
		let param_bindings: Vec<u64> = row["paramBindings"]
			.as_array()
			.map(|bindings| {
				bindings
					.iter()
					.map(|binding| binding.as_u64().ok_or("row param binding not a number"))
					.collect::<Result<_, _>>()
			})
			.unwrap_or_else(|| Ok(Vec::new()))?;
		if param_bindings.len() > 1 {
			return Err("static collection index params not supported yet".to_string());
		}
		self.flush_statics(target);
		self.uses_ctx = true;
		let temp = self.next_temp();
		let mut items = String::new();
		for item in ir["items"].as_array().ok_or("array ir items missing")? {
			write!(items, "std::rc::Rc::new({}), ", literal_expression(item)?).unwrap();
		}
		writeln!(
			self.body,
			"    let items_{temp}: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = vec![{items}];\n    \
			 for row_item_{temp} in items_{temp}.iter() {{"
		)
		.unwrap();
		if let Some(item_binding) = param_bindings.first() {
			let item_variable = format!("row_item_value_{temp}");
			writeln!(
				self.body,
				"    let {item_variable} = std::rc::Rc::clone(row_item_{temp});"
			)
			.unwrap();
			self.locals.insert(*item_binding, item_variable);
			self.local_kinds
				.insert(*item_binding, LocalKind::PlainValue);
		}
		let saved_local_components = self.local_components.clone();
		let saved_elements = std::mem::take(&mut self.element_ids);
		let mut expand = || -> Result<(), String> {
			for setup_entry in row["setup"].as_array().ok_or("row setup missing")? {
				self.write_setup(setup_entry)?;
			}
			self.write_ops(row["ops"].as_array().ok_or("row ops missing")?, target)?;
			self.flush_statics(target);
			Ok(())
		};
		let result = expand();
		self.element_ids = saved_elements;
		self.local_components = saved_local_components;
		result?;
		writeln!(self.body, "    }}").unwrap();
		Ok(())
	}

	fn write_collection(&mut self, op: &Json, target: &str) -> Result<(), String> {
		if !op["ssr"]["idBase"].is_null() {
			return Err("collection idBase not supported yet".to_string());
		}
		if op["ssr"]["usesRowId"].as_bool() == Some(true) {
			return Err("row-id collections not supported yet".to_string());
		}
		let source = &op["source"];
		let source_kind = source["kind"]
			.as_str()
			.ok_or("collection source kind missing")?;
		if source_kind == "direct-array" {
			return self.write_static_collection(op, target);
		}
		if !matches!(source_kind, "direct-reactive" | "derived") {
			return Err(format!("collection source {source} not supported yet"));
		}
		let key_segment = op["key"]
			.as_str()
			.ok_or("keyless collections not supported yet")?;
		let row = &op["row"]["segment"];
		if row.is_null() {
			return Err("inline collection rows not supported yet".to_string());
		}
		let uses_index_signal = op["usesIndexSignal"].as_bool() == Some(true);
		let row_shape = op["ssr"]["rowShape"]
			.as_u64()
			.ok_or("collection rowShape missing")?;
		let param_bindings: Vec<u64> = row["paramBindings"]
			.as_array()
			.ok_or("segment row without paramBindings")?
			.iter()
			.map(|binding| binding.as_u64().ok_or("row param binding not a number"))
			.collect::<Result<_, _>>()?;
		self.uses_ctx = true;
		self.flush_statics(target);
		let temp = self.next_temp();
		let range = format!("for_range_{temp}");
		let tracked = format!("tracked_{temp}");
		let effect = format!("for_effect_{temp}");
		let key_qrl = self.qrl_expression(key_segment, true)?;
		let row_segment = row["segment"]
			.as_str()
			.ok_or("row segment id missing")?
			.to_string();
		let render_qrl = self.qrl_expression(&row_segment, true)?;
		let row_symbol = self.generate_segment_fn(
			&row_segment,
			&row.clone(),
			SegmentFnKind::CollectionRow {
				param_bindings: param_bindings.clone(),
				uses_index_signal,
			},
		)?;
		writeln!(self.body, "    let row_qrl_{temp} = {render_qrl};").unwrap();
		let render_qrl = format!("std::rc::Rc::clone(&row_qrl_{temp})");
		if source_kind == "direct-reactive" {
			let source_ir = &source["ir"];
			if source_ir["kind"].as_str() != Some("binding-read") {
				return Err("collection source without a signal-container read".to_string());
			}
			let source_signal = self.signal_local(source_ir)?;
			writeln!(
				self.body,
				"    let {range} = ctx.next_id();\n    \
				 {target}.push_str(&format!(\"<!f={{}}>\", {range}));\n    \
				 let mut {tracked}: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();\n    \
				 let items_{temp} = qwik::render::tracked_array_items(&{source_signal}, &mut {tracked});\n    \
				 let {effect} = ctx.create_for_effect({range}, {tracked}.clone(), {key_qrl}, {render_qrl}, {uses_index_signal}, {row_shape});"
			)
			.unwrap();
		} else {
			// derived: the source computes through a rooted wrapper Computed the block tracks
			let source_segment = source["segment"]
				.as_str()
				.ok_or("derived source has no segment")?
				.to_string();
			let source_ir = &source["ir"];
			if source_ir.is_null() {
				return Err("derived source without a lowered ir".to_string());
			}
			for capture in self.segment_captures(&source_segment)? {
				writeln!(
					self.body,
					"    ctx.serializer.add_root(std::rc::Rc::clone(&{capture}));"
				)
				.unwrap();
			}
			let source_qrl = self.qrl_expression(&source_segment, true)?;
			let source_symbol = self.generate_value_fn(&source_segment, &source_ir.clone())?;
			let derived = format!("derived_{temp}");
			writeln!(
				self.body,
				"    let {range} = ctx.next_id();\n    \
				 let {derived} = qwik::render::new_computed({source_qrl});\n    \
				 ctx.serializer.add_root(std::rc::Rc::clone(&{derived}));\n    \
				 {target}.push_str(&format!(\"<!f={{}}>\", {range}));\n    \
				 let items_{temp} = qwik::render::array_items(&qwik::render::computed_read_with(&{derived}, {source_symbol}));\n    \
				 let {effect} = ctx.create_for_effect({range}, vec![std::rc::Rc::clone(&{derived})], {key_qrl}, {render_qrl}, {uses_index_signal}, {row_shape});"
			)
			.unwrap();
		}
		writeln!(
			self.body,
			"    let mut rows_{temp}: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();\n    \
			 for (row_index_{temp}, row_item_{temp}) in items_{temp}.iter().enumerate() {{"
		)
		.unwrap();
		// row params: item value, then the per-row index signal
		let mut index_argument = String::new();
		if uses_index_signal {
			let index_variable = format!("row_index_signal_{temp}");
			writeln!(
				self.body,
				"    let {index_variable} = qwik::render::new_signal(std::rc::Rc::new(qwik::serdes::SerdesValue::Number(row_index_{temp} as f64)));\n    \
				 ctx.serializer.add_root(std::rc::Rc::clone(&{index_variable}));\n    \
				 qwik::render::SsrContext::add_index_signal(&{effect}, std::rc::Rc::clone(&{index_variable}));"
			)
			.unwrap();
			index_argument = format!(", &{index_variable}");
		}
		// row keys become state roots (reconciliation identity) before the row renders; the
		// key ir reads row-scope bindings, so bind them for the key expression only
		if !op["keyIr"].is_null() {
			if let Some(item_binding) = param_bindings.first() {
				self.locals
					.insert(*item_binding, format!("(*row_item_{temp})"));
				self.local_kinds
					.insert(*item_binding, LocalKind::PlainValue);
			}
			let key_tracked = format!("key_tracked_{temp}");
			let key_expression =
				self.ir_expression(&op["keyIr"], &format!("(&mut {key_tracked})"))?;
			writeln!(
				self.body,
				"    let mut {key_tracked}: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();\n    \
				 ctx.serializer.add_root({key_expression});\n    \
				 let _ = {key_tracked};"
			)
			.unwrap();
		}
		let target_argument = if target == "out" {
			"out".to_string()
		} else {
			format!("&mut {target}")
		};
		// rows invoke through the row QRL value (specs/07 invocation convention)
		writeln!(
			self.body,
			"    ctx.push_owner();\n    \
			 {row_symbol}(ctx, {target_argument}, row_item_{temp}{index_argument}, qwik::render::qrl_captures(&row_qrl_{temp}));\n    \
			 rows_{temp}.push(std::rc::Rc::new(qwik::serdes::SerdesValue::Array(ctx.pop_owner())));\n    \
			 }}\n    \
			 ctx.push_owner_item(std::rc::Rc::new(qwik::serdes::SerdesValue::Array(rows_{temp})));"
		)
		.unwrap();
		self.statics.push_str("<!/f>");
		Ok(())
	}

	fn write_suspense(&mut self, op: &Json, target: &str) -> Result<(), String> {
		if !op["inOrder"].is_null() {
			return Err("inOrder suspense not supported yet".to_string());
		}
		if !op["delay"].is_null() {
			return Err("suspense delay not supported yet".to_string());
		}
		let content_segment = op["content"]["segment"]
			.as_str()
			.ok_or("suspense content has no segment")?
			.to_string();
		let fallback_render = &op["fallback"];
		if !fallback_render.is_null() && fallback_render["ops"].is_null() {
			return Err("suspense fallback without a structural plan".to_string());
		}
		self.uses_ctx = true;
		self.flush_statics(target);
		let temp = self.next_temp();
		let range = format!("suspense_range_{temp}");
		let buffer = format!("suspense_content_{temp}");
		let content_qrl = self.qrl_expression(&content_segment, true)?;
		let content_symbol =
			self.generate_segment_fn(&content_segment, &op["content"], SegmentFnKind::BranchArm)?;
		writeln!(self.body, "    let {range} = ctx.next_id();").unwrap();
		writeln!(
			self.body,
			"    let content_qrl_{temp} = {content_qrl};\n    \
			 let mut {buffer} = String::new();\n    \
			 {content_symbol}(ctx, &mut {buffer}, qwik::render::qrl_captures(&content_qrl_{temp}));"
		)
		.unwrap();
		let content_qrl = format!("std::rc::Rc::clone(&content_qrl_{temp})");
		let (fallback_qrl, fallback_closure) = if fallback_render.is_null() {
			("None".to_string(), "|_ctx, _out| {}".to_string())
		} else {
			let fallback_segment = fallback_render["segment"]
				.as_str()
				.ok_or("fallback render has no segment")?
				.to_string();
			let qrl = self.qrl_expression(&fallback_segment, true)?;
			let fallback_symbol = self.generate_segment_fn(
				&fallback_segment,
				fallback_render,
				SegmentFnKind::BranchArm,
			)?;
			writeln!(self.body, "    let fallback_qrl_{temp} = {qrl};").unwrap();
			(
				format!("Some(std::rc::Rc::clone(&fallback_qrl_{temp}))"),
				format!("|ctx: &mut qwik::render::SsrContext, out: &mut String| {{ {fallback_symbol}(ctx, out, qwik::render::qrl_captures(&fallback_qrl_{temp})); }}"),
			)
		};
		let out_argument = if target == "out" {
			"out".to_string()
		} else {
			format!("&mut {target}")
		};
		writeln!(
			self.body,
			"    ctx.suspense({out_argument}, {range}, {buffer}, {content_qrl}, {fallback_qrl}, {fallback_closure});"
		)
		.unwrap();
		Ok(())
	}

	fn write_content(&mut self, op: &Json, target: &str) -> Result<(), String> {
		let segment_id = op["value"]["segment"]
			.as_str()
			.ok_or("content op has no segment")?;
		let ir = &op["value"]["ir"];
		if ir.is_null() {
			return Err(format!("content op {segment_id:?} without a lowered value"));
		}
		if op["ssr"]["root"].as_bool() == Some(true) {
			return Err("root content ops not supported yet".to_string());
		}
		self.uses_ctx = true;
		self.flush_statics(target);
		let temp = self.next_temp();
		let range = format!("content_range_{temp}");
		let tracked = format!("tracked_{temp}");
		let captures = self.segment_captures(segment_id)?;
		let mut args = String::new();
		for capture in &captures {
			write!(args, "std::rc::Rc::clone(&{capture}), ").unwrap();
		}
		writeln!(self.body, "    let {range} = ctx.next_id();").unwrap();
		writeln!(
			self.body,
			"    {target}.push_str(&format!(\"<!d={{}}>\", {range}));"
		)
		.unwrap();
		for capture in &captures {
			writeln!(
				self.body,
				"    ctx.serializer.add_root(std::rc::Rc::clone(&{capture}));"
			)
			.unwrap();
		}
		let expression = self.ir_expression(ir, &format!("&mut {tracked}"))?;
		let qrl = self.qrl_expression(segment_id, false)?;
		writeln!(
			self.body,
			"    let mut {tracked}: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();\n    \
			 let content_value_{temp} = {expression};\n    \
			 ctx.create_content_effect({range}, {tracked}, vec![{args}], {qrl}, false);\n    \
			 {target}.push_str(&qwik::render::escape_ssr_content(&content_value_{temp}));"
		)
		.unwrap();
		self.statics.push_str("<!/d>");
		Ok(())
	}

	fn task_steps(
		&mut self,
		steps: &[Json],
		tracked: &str,
		output: &mut String,
	) -> Result<(), String> {
		for step in steps {
			match step["s"].as_str().ok_or("task step has no kind")? {
				"if" => {
					let test = self.ir_expression(&step["test"], tracked)?;
					writeln!(output, "        if qwik::render::truthy(&{test}) {{").unwrap();
					let then_steps = step["then"]
						.as_array()
						.ok_or("if step has no then")?
						.clone();
					self.task_steps(&then_steps, tracked, output)?;
					writeln!(output, "        }}").unwrap();
					if let Some(else_steps) =
						step["else"].as_array().filter(|steps| !steps.is_empty())
					{
						let else_steps = else_steps.clone();
						writeln!(output, "        else {{").unwrap();
						self.task_steps(&else_steps, tracked, output)?;
						writeln!(output, "        }}").unwrap();
					}
				}
				"set-signal" => {
					let binding = step["binding"]
						.as_u64()
						.ok_or("set-signal has no binding")?;
					let signal = self.local(binding)?;
					let value = self.ir_expression(&step["value"], tracked)?;
					writeln!(
						output,
						"        qwik::render::set_signal_value(&{signal}, {value});"
					)
					.unwrap();
				}
				kind => return Err(format!("task step {kind:?} not supported yet")),
			}
		}
		Ok(())
	}

	fn write_dynamic(&mut self, op: &Json, target: &str) -> Result<(), String> {
		if op["output"].as_str() != Some("text") {
			return Err("dynamic content output not supported yet".to_string());
		}
		let plan_target = &op["ssr"]["target"];
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
		if ir["kind"].as_str() == Some("signal-read")
			&& self
				.local_kinds
				.get(&ir["binding"].as_u64().unwrap_or(u64::MAX))
				== Some(&LocalKind::Computed)
		{
			// computed fast path: evaluate lazily, subscribe the effect on the computed itself
			let binding = ir["binding"].as_u64().ok_or("signal-read has no binding")?;
			let computed = self.local(binding)?;
			let computed_fn = self
				.computed_fns
				.get(&binding)
				.ok_or("computed fn missing")?
				.clone();
			let temp = self.next_temp();
			let subscribe = if is_range {
				let marker = plan_target["marker"]
					.as_u64()
					.ok_or("range target has no marker")?;
				format!("ctx.subscribe_range_text(&{computed}, {element_variable}, {marker});")
			} else {
				format!("ctx.subscribe_element_text(&{computed}, {element_variable});")
			};
			writeln!(
				self.body,
				"    ctx.serializer.add_root(std::rc::Rc::clone(&{computed}));\n    \
				 let computed_value_{temp} = qwik::render::computed_read_with(&{computed}, {computed_fn});\n    {subscribe}\n    \
				 {target}.push_str(&qwik::escape::escape_html(&qwik::render::ssr_text_value(&computed_value_{temp})));"
			)
			.unwrap();
			if is_range {
				self.statics.push_str("<!/t>");
			}
			return Ok(());
		}
		if ir["kind"].as_str() == Some("signal-read") {
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
				 {target}.push_str(&qwik::escape::escape_html(&qwik::render::signal_text(&{signal})));"
			)
			.unwrap();
		} else if let Some(segment_id) = op["value"]["segment"].as_str() {
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
			let expression = self.ir_expression(ir, &format!("&mut {tracked}"))?;
			let qrl = self.qrl_expression(segment_id, false)?;
			writeln!(
				self.body,
				"    let mut {tracked}: Vec<std::rc::Rc<qwik::serdes::SerdesValue>> = Vec::new();"
			)
			.unwrap();
			self.track_destructured_props(segment_id, &format!("&mut {tracked}"))?;
			let subscribe = if is_range {
				let marker = plan_target["marker"]
					.as_u64()
					.ok_or("range target has no marker")?;
				format!("ctx.subscribe_text_expression(&{tracked}, {element_variable}, {marker}, vec![{args}], {qrl});")
			} else {
				format!("ctx.subscribe_element_text_expression(&{tracked}, {element_variable}, vec![{args}], {qrl});")
			};
			writeln!(
				self.body,
				"    let {value} = {expression};\n    \
				 if !{tracked}.is_empty() {{\n        \
				 {subscribe}\n    \
				 }}\n    \
				 {target}.push_str(&qwik::escape::escape_html(&qwik::render::ssr_text_value(&{value})));"
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

	/// Chunks of destructured-props components replay the full pattern before evaluating —
	/// emit the source tracking that destructure performs (no-op for plain object props).
	fn track_destructured_props(&mut self, segment_id: &str, tracked: &str) -> Result<(), String> {
		if !self.destructured_props {
			return Ok(());
		}
		let replays = self.segment(segment_id)?["captures"]
			.as_array()
			.ok_or("segment captures missing")?
			.iter()
			.any(|capture| capture["access"].as_str() == Some("component-prop"));
		if replays {
			self.uses_props = true;
			writeln!(
				self.body,
				"    qwik::render::track_props_sources(&props, {tracked});"
			)
			.unwrap();
		}
		Ok(())
	}

	fn segment_captures(&mut self, segment_id: &str) -> Result<Vec<String>, String> {
		let captures: Vec<(u64, bool)> = self.segment(segment_id)?["captures"]
			.as_array()
			.ok_or("segment captures missing")?
			.iter()
			.map(|capture| {
				capture["binding"]
					.as_u64()
					.ok_or("capture has no binding")
					.map(|binding| {
						(
							binding,
							capture["access"].as_str() == Some("component-prop"),
						)
					})
			})
			.collect::<Result<_, _>>()?;
		captures
			.into_iter()
			.map(|(binding, is_component_prop)| {
				// component-prop captures pass the props object — the chunk destructures it
				if is_component_prop {
					self.uses_props = true;
					Ok("props".to_string())
				} else {
					self.local(binding)
				}
			})
			.collect()
	}

	fn context_name(&self, binding: u64) -> Result<String, String> {
		self.plan["modules"][self.module_index]["contexts"]
			.as_array()
			.ok_or("module contexts missing")?
			.iter()
			.find(|entry| entry["binding"].as_u64() == Some(binding))
			.and_then(|entry| entry["name"].as_str())
			.map(|name| name.to_string())
			.ok_or(format!(
				"context binding {binding} missing from the module contexts"
			))
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
	/// `plugin-call` IR (specs/09): dispatch into the plugin's generated module.
	fn plugin_call_expression(&mut self, ir: &Json) -> Result<String, String> {
		let fn_id = ir["fnId"].as_str().ok_or("plugin-call has no fnId")?;
		let entry = self.plan["pluginFns"]
			.as_array()
			.and_then(|fns| {
				fns.iter()
					.find(|entry| entry["fnId"].as_str() == Some(fn_id))
			})
			.ok_or(format!("plugin fn {fn_id:?} missing from plan pluginFns"))?;
		// a package target is a crate the app depends on; a source target is a spliced module
		let native_name = match entry["targets"]["rust"]["crate"].as_str() {
			Some(crate_name) => crate_name.to_string(),
			None => plugin_module_name(entry, fn_id),
		};
		let export_name = entry["exportName"]
			.as_str()
			.ok_or("plugin fn has no exportName")?
			.to_string();
		// the implementation is plain Rust: convert here, letting inference pick each type
		let mut args = String::new();
		for (index, arg) in ir["args"]
			.as_array()
			.ok_or("plugin-call args missing")?
			.iter()
			.enumerate()
		{
			let value = literal_expression(arg)
				.map_err(|reason| format!("plugin-call arg: {reason} (literals only for now)"))?;
			write!(
				args,
				"qwik::native::arg(&{value}, {export_name:?}, {index}), "
			)
			.unwrap();
		}
		Ok(format!(
			"qwik::native::Serdes::into_serdes({native_name}::{export_name}({args}))"
		))
	}

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
			"std::rc::Rc::new(qwik::serdes::SerdesValue::Qrl(qwik::serdes::QrlValue {{\n        chunk: {chunk:?}.to_string(), symbol: {symbol:?}.to_string(), captures: vec![{captures}],\n    }}))"
		))
	}

	/// Compile a LambdaIR to a native predicate closure; params bind as plain row values.
	fn lambda_expression(&mut self, lambda: &Json, tracked: &str) -> Result<String, String> {
		let params = lambda["params"].as_array().ok_or("lambda params missing")?;
		let [param] = params.as_slice() else {
			return Err("multi-parameter lambdas not supported yet".to_string());
		};
		let binding = param["binding"]
			.as_u64()
			.ok_or("lambda param has no binding")?;
		let variable = format!("lambda_arg_{}", self.next_temp());
		self.locals.insert(binding, variable.clone());
		self.local_kinds.insert(binding, LocalKind::PlainValue);
		let body = self.ir_expression(&lambda["body"], tracked)?;
		Ok(format!(
			"|{variable}: &std::rc::Rc<qwik::serdes::SerdesValue>| {{\n        let predicate_value = {body};\n        qwik::render::truthy(&predicate_value)\n    }}"
		))
	}

	/// Compile a ValueIR tree to a Rust expression producing `Rc<SerdesValue>`; signal and
	/// props-source reads record into `tracked` (auto-track — the effect deps).
	fn ir_expression(&mut self, ir: &Json, tracked: &str) -> Result<String, String> {
		match ir["kind"].as_str().ok_or("ir node has no kind")? {
			"signal-read" => {
				let binding = ir["binding"].as_u64().ok_or("signal-read has no binding")?;
				let signal = self.local(binding)?;
				if self.local_kinds.get(&binding) == Some(&LocalKind::Computed) {
					return Err("computed reads inside expressions not supported yet".to_string());
				}
				Ok(format!(
					"qwik::render::tracked_signal_value(&{signal}, {tracked})"
				))
			}
			"binding-read" => {
				let binding = ir["binding"]
					.as_u64()
					.ok_or("binding-read has no binding")?;
				let variable = self.local(binding)?;
				match self.local_kinds.get(&binding) {
					Some(LocalKind::IndexSignal) => Ok(format!(
						"qwik::render::tracked_signal_value(&{variable}, {tracked})"
					)),
					Some(LocalKind::PlainValue) => Ok(format!("std::rc::Rc::clone(&{variable})")),
					kind => Err(format!(
						"binding-read of kind {:?} not supported in expressions",
						kind.is_some()
					)),
				}
			}
			"member" => {
				let object = &ir["obj"];
				let name = ir["name"].as_str().ok_or("member has no name")?;
				if object["kind"].as_str() == Some("binding-read") {
					let binding = object["binding"]
						.as_u64()
						.ok_or("binding-read has no binding")?;
					let variable = self.local(binding)?;
					match self.local_kinds.get(&binding) {
						Some(LocalKind::Store) | None => {
							return Ok(format!(
								"qwik::render::member_read(&{variable}, {name:?}, {tracked})"
							));
						}
						Some(LocalKind::PlainValue) => {
							// plain values may hold signals — member_read keeps JS semantics
							return Ok(format!(
								"qwik::render::member_read(&{variable}, {name:?}, {tracked})"
							));
						}
						_ => {
							return Err(format!("member on binding kind not supported: {object}"));
						}
					}
				}
				let object_expression = self.ir_expression(object, tracked)?;
				Ok(format!(
					"qwik::render::member_read(&{object_expression}, {name:?}, {tracked})"
				))
			}
			"index" => {
				let object = self.ir_expression(&ir["obj"], tracked)?;
				let index = self.ir_expression(&ir["key"], tracked)?;
				Ok(format!(
					"qwik::render::index_read(&{object}, &{index}, {tracked})"
				))
			}
			"unary" => {
				let operand = self.ir_expression(&ir["operand"], tracked)?;
				let helper = match ir["op"].as_str().ok_or("unary op missing")? {
					"!" => "js_not",
					"-" => "js_negate",
					"typeof" => "js_typeof",
					op => return Err(format!("unary operator {op:?} not supported yet")),
				};
				Ok(format!("qwik::render::{helper}(&{operand})"))
			}
			"lit" => Ok(format!("std::rc::Rc::new({})", literal_expression(ir)?)),
			"undef" => {
				Ok("std::rc::Rc::new(qwik::serdes::SerdesValue::Undefined)".to_string())
			}
			"bin" => {
				let left = self.ir_expression(&ir["left"], tracked)?;
				let right = self.ir_expression(&ir["right"], tracked)?;
				let helper = match ir["op"].as_str().ok_or("bin op missing")? {
					"+" => "js_add",
					"*" => "js_mul",
					"===" => "js_strict_eq",
					"==" => "js_loose_eq",
					">" => "js_gt",
					op => return Err(format!("binary operator {op:?} not supported yet")),
				};
				Ok(format!("qwik::render::{helper}(&{left}, &{right})"))
			}
			"logic" => {
				let a = self.ir_expression(&ir["left"], tracked)?;
				let b = self.ir_expression(&ir["right"], tracked)?;
				// b evaluates only when taken — its tracked reads are dep-observable
				match ir["op"].as_str().ok_or("logic ir has no op")? {
					"&&" => Ok(format!(
						"{{ let logic_a = {a}; if qwik::render::truthy(&logic_a) {{ {b} }} else {{ logic_a }} }}"
					)),
					"||" => Ok(format!(
						"{{ let logic_a = {a}; if qwik::render::truthy(&logic_a) {{ logic_a }} else {{ {b} }} }}"
					)),
					op => Err(format!("logic operator {op:?} not supported yet")),
				}
			}
			"cond" => {
				let test = self.ir_expression(&ir["test"], tracked)?;
				// branches evaluate lazily — only the taken side's tracked reads register
				let then = self.ir_expression(&ir["then"], tracked)?;
				let otherwise = self.ir_expression(&ir["else"], tracked)?;
				Ok(format!(
					"{{ if qwik::render::truthy(&{test}) {{ {then} }} else {{ {otherwise} }} }}"
				))
			}
			"template" => {
				let mut parts = String::new();
				for part in ir["parts"].as_array().ok_or("template parts missing")? {
					if let Some(text) = part.as_str() {
						write!(parts, "qwik::render::TemplatePart::Text({text:?}), ")
							.unwrap();
					} else {
						let expression = self.ir_expression(part, tracked)?;
						write!(
							parts,
							"qwik::render::TemplatePart::Value({expression}), "
						)
						.unwrap();
					}
				}
				Ok(format!("qwik::render::js_template(&[{parts}])"))
			}
			"call" => {
				let fn_id = ir["fn"].as_str().ok_or("call has no fn")?;
				let recv = &ir["receiver"];
				if recv.is_null() {
					return Err("receiver-less plugin calls not supported yet".to_string());
				}
				let recv_expression = self.ir_expression(recv, tracked)?;
				if fn_id == "qwik:array.filter" {
					let lambda = &ir["args"][0];
					if lambda["kind"].as_str() != Some("lambda") {
						return Err("qwik:array.filter needs a lambda argument".to_string());
					}
					let predicate = self.lambda_expression(lambda, tracked)?;
					return Ok(format!(
						"qwik_ssr_std::array_filter(&{recv_expression}, {predicate})"
					));
				}
				let mut args = String::new();
				for arg in ir["args"].as_array().ok_or("call args missing")? {
					write!(args, "{}, ", self.ir_expression(arg, tracked)?).unwrap();
				}
				Ok(format!(
					"qwik_ssr_std::call({fn_id:?}, &{recv_expression}, &[{args}])"
				))
			}
			"object" => {
				let mut entries = String::new();
				for pair in ir["entries"]
					.as_array()
					.ok_or("object ir entries missing")?
				{
					let pair = pair.as_array().ok_or("object ir entry not a pair")?;
					let key = pair[0].as_str().ok_or("object ir key not a string")?;
					let value = self.ir_expression(&pair[1], tracked)?;
					write!(entries, "({key:?}.to_string(), {value}), ").unwrap();
				}
				Ok(format!(
					"std::rc::Rc::new(qwik::serdes::SerdesValue::Object(vec![{entries}]))"
				))
			}
			"array" => {
				let mut items = String::new();
				for item in ir["items"].as_array().ok_or("array ir items missing")? {
					write!(items, "{}, ", self.ir_expression(item, tracked)?).unwrap();
				}
				Ok(format!(
					"std::rc::Rc::new(qwik::serdes::SerdesValue::Array(vec![{items}]))"
				))
			}
			"def-call" => {
				let def = ir["def"].as_u64().ok_or("def-call has no def index")?;
				let mut args = String::new();
				for arg in ir["args"].as_array().ok_or("def-call args missing")? {
					write!(args, "&{}, ", self.ir_expression(arg, tracked)?).unwrap();
				}
				Ok(format!("def_{}_{def}({args})", self.module_index))
			}
			kind => Err(format!("ir kind {kind:?} not supported yet")),
		}
	}
}

/// Object-literal ValueIR → `SerdesValue::Object` expression (store init shapes).
fn object_literal_expression(ir: &Json) -> Result<String, String> {
	if ir["kind"].as_str() != Some("object") {
		return Err(format!("store init {ir} not supported yet"));
	}
	let mut entries = String::new();
	for pair in ir["entries"]
		.as_array()
		.ok_or("object ir entries missing")?
	{
		let pair = pair.as_array().ok_or("object ir entry not a pair")?;
		let key = pair[0].as_str().ok_or("object ir key not a string")?;
		let value = literal_expression(&pair[1])?;
		write!(
			entries,
			"({key:?}.to_string(), std::rc::Rc::new({value})), "
		)
		.unwrap();
	}
	Ok(format!(
		"qwik::serdes::SerdesValue::Object(vec![{entries}])"
	))
}

fn source_ir_of(op: &Json) -> Result<Json, String> {
	let ir = op["source"]["ir"].clone();
	if ir.is_null() {
		return Err("collection source without a lowered ir".to_string());
	}
	Ok(ir)
}

fn literal_expression(ir: &Json) -> Result<String, String> {
	match ir["kind"].as_str().ok_or("ir node has no kind")? {
		"lit" => json_literal_expression(&ir["value"]),
		"undef" => Ok("qwik::serdes::SerdesValue::Undefined".to_string()),
		"array" => {
			let mut items = String::new();
			for item in ir["items"].as_array().ok_or("array ir items missing")? {
				use std::fmt::Write as _;
				write!(items, "std::rc::Rc::new({}), ", literal_expression(item)?).unwrap();
			}
			Ok(format!(
				"qwik::serdes::SerdesValue::Array(vec![{items}])"
			))
		}
		"object" => object_literal_expression(ir),
		kind => Err(format!("setup ir {kind:?} not supported yet")),
	}
}

fn json_literal_expression(value: &Json) -> Result<String, String> {
	match value {
		Json::Number(number) => Ok(format!(
			"qwik::serdes::SerdesValue::Number({}f64)",
			number.as_f64().ok_or("literal is not an f64")?
		)),
		Json::String(text) => Ok(format!(
			"qwik::serdes::SerdesValue::String({text:?}.to_string())"
		)),
		Json::Bool(boolean) => Ok(format!("qwik::serdes::SerdesValue::Bool({boolean})")),
		Json::Null => Ok("qwik::serdes::SerdesValue::Null".to_string()),
		other => Err(format!("literal {other:?} not supported yet")),
	}
}
