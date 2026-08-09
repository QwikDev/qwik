//! `JSON.stringify` byte-compatibility (specs/06): ES property ordering, ES number
//! formatting, QuoteJSONString escaping. Not serde_json — its bytes differ.

use crate::number::to_js_string;
use crate::value::Value;

/// `JSON.stringify(value)` with no replacer/indent. `None` mirrors JS `undefined` output.
pub fn stringify(value: &Value) -> Option<String> {
	let mut output = String::new();
	write_value(value, &mut output).then_some(output)
}

fn write_value(value: &Value, output: &mut String) -> bool {
	match value {
		Value::Undefined => false,
		Value::Null => {
			output.push_str("null");
			true
		}
		Value::Bool(boolean) => {
			output.push_str(if *boolean { "true" } else { "false" });
			true
		}
		Value::Number(number) => {
			if number.is_finite() {
				output.push_str(&to_js_string(*number));
			} else {
				output.push_str("null");
			}
			true
		}
		Value::String(text) => {
			write_quoted(text, output);
			true
		}
		Value::Array(items) => {
			output.push('[');
			for (index, item) in items.iter().enumerate() {
				if index > 0 {
					output.push(',');
				}
				if !write_value(item, output) {
					output.push_str("null");
				}
			}
			output.push(']');
			true
		}
		Value::Object(object) => {
			output.push('{');
			let mut first = true;
			for (key, item) in object.ordered_entries() {
				let mut item_output = String::new();
				if !write_value(item, &mut item_output) {
					continue; // undefined props are skipped
				}
				if !first {
					output.push(',');
				}
				first = false;
				write_quoted(key, output);
				output.push(':');
				output.push_str(&item_output);
			}
			output.push('}');
			true
		}
	}
}

/// A JSON string literal, for embedding data in generated scripts.
pub fn quoted(text: &str) -> String {
	let mut output = String::new();
	write_quoted(text, &mut output);
	output
}

fn write_quoted(text: &str, output: &mut String) {
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
			ch if (ch as u32) < 0x20 => {
				output.push_str(&format!("\\u{:04x}", ch as u32));
			}
			ch => output.push(ch),
		}
	}
	output.push('"');
}
