//! Container assembly (specs/05). Attribute order and values mirror
//! `packages/qwik/src/server/ssr-render.ts` `createContainerAttributes`.

use crate::escape::escape_html;

pub struct ContainerOptions {
	pub tag: String,
	pub version: String,
	pub render_mode: String,
	pub base: String,
	pub locale: String,
	pub manifest_hash: String,
	pub instance_hash: String,
}

pub fn render_container(options: &ContainerOptions, body: impl FnOnce(&mut String)) -> String {
	let mut output = String::new();
	output.push('<');
	output.push_str(&options.tag);
	for (name, value) in [
		("q:container", "paused"),
		("q:runtime", "2"),
		("q:version", options.version.as_str()),
		("q:render", options.render_mode.as_str()),
		("q:base", options.base.as_str()),
		("q:locale", options.locale.as_str()),
		("q:manifest-hash", options.manifest_hash.as_str()),
		("q:instance", options.instance_hash.as_str()),
	] {
		output.push(' ');
		output.push_str(name);
		output.push_str("=\"");
		output.push_str(&escape_html(value));
		output.push('"');
	}
	output.push('>');
	body(&mut output);
	output.push_str("</");
	output.push_str(&options.tag);
	output.push('>');
	output
}
