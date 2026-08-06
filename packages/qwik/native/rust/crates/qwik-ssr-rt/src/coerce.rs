//! SSR text-interpolation coercion (specs/06): `value == null ? '' : String(value)`.

use crate::number::to_js_string;
use crate::value::Value;

pub fn to_ssr_text(value: &Value) -> String {
	match value {
		Value::Undefined | Value::Null => String::new(),
		_ => js_to_string(value),
	}
}

fn js_to_string(value: &Value) -> String {
	match value {
		Value::Undefined => "undefined".to_string(),
		Value::Null => "null".to_string(),
		Value::Bool(true) => "true".to_string(),
		Value::Bool(false) => "false".to_string(),
		Value::Number(number) => to_js_string(*number),
		Value::String(text) => text.clone(),
		// Array.prototype.toString joins with ',', null/undefined items as ''
		Value::Array(items) => items
			.iter()
			.map(|item| match item {
				Value::Undefined | Value::Null => String::new(),
				_ => js_to_string(item),
			})
			.collect::<Vec<_>>()
			.join(","),
		Value::Object(_) => "[object Object]".to_string(),
	}
}
