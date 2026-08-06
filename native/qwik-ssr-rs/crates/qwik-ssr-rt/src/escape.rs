//! Runtime dynamic escaping (specs/05): exactly `& < > " '`, apostrophe as `&#39;`.
//! Compile-time static escaping is a different profile and never re-applied by engines.

pub fn escape_html(input: &str) -> String {
	let mut output = String::with_capacity(input.len());
	for ch in input.chars() {
		match ch {
			'&' => output.push_str("&amp;"),
			'<' => output.push_str("&lt;"),
			'>' => output.push_str("&gt;"),
			'"' => output.push_str("&quot;"),
			'\'' => output.push_str("&#39;"),
			_ => output.push(ch),
		}
	}
	output
}
