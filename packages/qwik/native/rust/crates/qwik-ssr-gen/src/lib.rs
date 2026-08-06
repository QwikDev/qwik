//! Plan → Rust source generator (specs/07). Consumes a linked `qwik/ssr-plan` (v0) and emits
//! specialized render functions calling the `qwik-ssr-rt` ABI. Fail-closed: any construct the
//! generator does not support yet aborts generation with a named reason — never silent output.

use serde_json::Value as Json;

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

/// Emits `pub fn render_<name>(out: &mut String)` for one component of a linked plan.
pub fn generate_component(plan: &Json, component_index: usize) -> Result<String, String> {
	let component = plan["components"]
		.get(component_index)
		.ok_or("component index out of range")?;
	let name = component["name"].as_str().ok_or("component has no name")?;
	let ssr = &component["ssr"];
	if ssr.is_null() {
		return Err(format!("component {name:?} has no ssr plan"));
	}
	if let Some(entry) = ssr["setup"].as_array().ok_or("ssr.setup missing")?.first() {
		return Err(format!("setup op not supported yet: {entry}"));
	}

	let mut statics = String::new();
	let mut body = String::new();
	write_ops(
		ssr["ops"].as_array().ok_or("ssr.ops missing")?,
		&mut statics,
		&mut body,
	)?;
	flush_statics(&mut statics, &mut body);

	let function_name = format!("render_{}", name.to_lowercase());
	Ok(format!(
		"pub fn {function_name}(out: &mut String) {{\n{body}}}\n"
	))
}

/// Consecutive static output merges into one `push_str` — flushed before any dynamic step.
fn flush_statics(statics: &mut String, body: &mut String) {
	if !statics.is_empty() {
		body.push_str(&format!("    out.push_str({:?});\n", statics));
		statics.clear();
	}
}

fn write_ops(ops: &[Json], statics: &mut String, body: &mut String) -> Result<(), String> {
	for op in ops {
		match op["o"].as_str().ok_or("op has no kind")? {
			"static" => {
				// pre-escaped at plan emission (compile-time text profile)
				statics.push_str(op["html"].as_str().ok_or("static op has no html")?);
			}
			"el" => write_element(op, statics, body)?,
			kind => return Err(format!("op {kind:?} not supported yet")),
		}
	}
	Ok(())
}

fn write_element(op: &Json, statics: &mut String, body: &mut String) -> Result<(), String> {
	if !op["id"].is_null() {
		return Err("element q:id targets not supported yet".to_string());
	}
	if !op["styleScopedId"].is_null() {
		return Err("style-scoped elements not supported yet".to_string());
	}
	if !op["propsEffect"].is_null() {
		return Err("props effects not supported yet".to_string());
	}
	let tag = op["tag"].as_str().ok_or("element has no tag")?;
	statics.push('<');
	statics.push_str(tag);
	for prop in op["props"].as_array().ok_or("element props missing")? {
		match prop["p"].as_str().ok_or("prop has no kind")? {
			"static" => {
				let name = prop["name"].as_str().ok_or("static prop has no name")?;
				statics.push_str(&serialize_static_attr(name, &prop["value"])?);
			}
			kind => return Err(format!("prop {kind:?} not supported yet")),
		}
	}
	statics.push('>');
	write_ops(
		op["children"]
			.as_array()
			.ok_or("element children missing")?,
		statics,
		body,
	)?;
	if !op["void"].as_bool().unwrap_or(false) {
		statics.push_str(&format!("</{tag}>"));
	}
	Ok(())
}
