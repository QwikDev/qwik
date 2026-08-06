//! Minimal HTTP host for the native SSR engine: serves the generated page at `/` and the
//! client build output under `/build/*`. E2E/testing tool — not a production server.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::Arc;

mod generated {
	#![allow(
		non_snake_case,
		unused_mut,
		unused_variables,
		clippy::type_complexity,
		clippy::comparison_to_empty,
		clippy::needless_borrow,
		clippy::needless_else,
		clippy::borrow_deref_ref
	)]
	include!(concat!(env!("OUT_DIR"), "/generated.rs"));
}

struct Host {
	chunk_map: HashMap<String, String>,
	manifest_hash: String,
	client_dir: PathBuf,
}

fn main() {
	let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../../../..");
	let client_dir = std::env::var("QWIK_CLIENT_DIR")
		.map(PathBuf::from)
		.unwrap_or_else(|_| repo_root.join("e2e/qwik-e2e/apps/native-counter/dist/client"));
	let manifest_path = client_dir.join("q-manifest.json");
	let manifest: serde_json::Value = serde_json::from_str(
		&std::fs::read_to_string(&manifest_path)
			.unwrap_or_else(|error| panic!("cannot read {manifest_path:?}: {error}")),
	)
	.expect("manifest is valid JSON");
	let chunk_map: HashMap<String, String> = manifest["mapping"]
		.as_object()
		.expect("manifest mapping")
		.iter()
		.map(|(symbol, bundle)| (symbol.clone(), bundle.as_str().unwrap_or("").to_string()))
		.collect();
	let manifest_hash = manifest["manifestHash"]
		.as_str()
		.unwrap_or("native")
		.to_string();

	let port: u16 = std::env::args()
		.nth(1)
		.and_then(|argument| argument.parse().ok())
		.unwrap_or(3310);
	let host = Arc::new(Host {
		chunk_map,
		manifest_hash,
		client_dir,
	});
	let listener = TcpListener::bind(("127.0.0.1", port)).expect("bind");
	println!("qwik-ssr-host listening on http://127.0.0.1:{port}/");
	let mut request_counter: u64 = 0;
	for stream in listener.incoming() {
		let Ok(stream) = stream else { continue };
		request_counter += 1;
		let host = Arc::clone(&host);
		let counter = request_counter;
		std::thread::spawn(move || handle(stream, &host, counter));
	}
}

fn handle(mut stream: TcpStream, host: &Host, counter: u64) {
	let mut buffer = [0u8; 4096];
	let Ok(read) = stream.read(&mut buffer) else {
		return;
	};
	let request = String::from_utf8_lossy(&buffer[..read]);
	let path = request
		.split_whitespace()
		.nth(1)
		.unwrap_or("/")
		.split('?')
		.next()
		.unwrap_or("/");

	if path == "/" {
		let html = render(host, counter);
		respond(
			&mut stream,
			200,
			"text/html; charset=utf-8",
			html.as_bytes(),
		);
		return;
	}
	if let Some(file) = path.strip_prefix("/build/") {
		// fail closed on any traversal shape
		if file.contains("..") || file.contains('/') {
			respond(&mut stream, 404, "text/plain", b"not found");
			return;
		}
		let full = host.client_dir.join("build").join(file);
		match std::fs::read(&full) {
			Ok(bytes) => {
				let content_type = match full.extension().and_then(|extension| extension.to_str()) {
					Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
					Some("css") => "text/css; charset=utf-8",
					Some("json") => "application/json",
					_ => "application/octet-stream",
				};
				respond(&mut stream, 200, content_type, &bytes);
			}
			Err(_) => respond(&mut stream, 404, "text/plain", b"not found"),
		}
		return;
	}
	respond(&mut stream, 404, "text/plain", b"not found");
}

fn render(host: &Host, counter: u64) -> String {
	let nanos = std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.map(|duration| duration.subsec_nanos() as u64)
		.unwrap_or(0);
	let instance = base36(nanos.wrapping_mul(counter.wrapping_add(1)) & 0x7fff_ffff);
	let options = qwik_ssr_rt::render::PageOptions {
		container: qwik_ssr_rt::render::ContainerOptions {
			tag: "html".to_string(),
			version: "3.0.0-native".to_string(),
			render_mode: "ssr".to_string(),
			base: "/build/".to_string(),
			locale: String::new(),
			manifest_hash: host.manifest_hash.clone(),
			instance_hash: instance,
		},
		qwik_loader: generated::QWIK_LOADER.to_string(),
		streaming: false,
		chunk_map: Some(host.chunk_map.clone()),
	};
	let page = qwik_ssr_rt::render::render_page(&options, generated::render_entry);
	format!("<!DOCTYPE html>{page}")
}

fn base36(mut value: u64) -> String {
	const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
	let mut out = Vec::new();
	for _ in 0..6 {
		out.push(DIGITS[(value % 36) as usize]);
		value /= 36;
	}
	String::from_utf8(out).unwrap()
}

fn respond(stream: &mut TcpStream, status: u16, content_type: &str, body: &[u8]) {
	let reason = if status == 200 { "OK" } else { "Not Found" };
	let head = format!(
		"HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
		body.len()
	);
	let _ = stream.write_all(head.as_bytes());
	let _ = stream.write_all(body);
}
