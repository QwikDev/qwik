//! Multi-app HTTP host for the native SSR engine, no Node in the serving path: `/` lists the
//! compiled-in e2e apps, `/<app>/` renders it, `/<app>/build/*` serves the client bundles.
//! E2E/testing tool — not a production server.

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
		clippy::borrow_deref_ref,
		unused_parens
	)]
	include!(concat!(env!("OUT_DIR"), "/generated.rs"));
}

struct App {
	name: &'static str,
	render: fn(&mut qwik_ssr_rt::render::SsrContext, &mut String),
	client_dir: PathBuf,
	chunk_map: HashMap<String, String>,
	manifest_hash: String,
}

struct Host {
	apps: Vec<App>,
	/// Apps that could not be served, with the plan-gate or build reason.
	failed: Vec<(&'static str, String)>,
}

fn load_apps(apps_dir: &std::path::Path) -> Host {
	let mut apps = Vec::new();
	let mut failed = Vec::new();
	for entry in generated::APPS {
		if let Some(reason) = entry.error {
			failed.push((entry.name, reason.to_string()));
			continue;
		}
		let client_dir = apps_dir.join(entry.name).join("dist/client");
		let manifest_path = client_dir.join("q-manifest.json");
		let manifest: serde_json::Value = match std::fs::read_to_string(&manifest_path)
			.map_err(|error| error.to_string())
			.and_then(|text| serde_json::from_str(&text).map_err(|error| error.to_string()))
		{
			Ok(manifest) => manifest,
			Err(error) => {
				failed.push((entry.name, format!("client build missing ({error})")));
				continue;
			}
		};
		let chunk_map = manifest["mapping"]
			.as_object()
			.map(|mapping| {
				mapping
					.iter()
					.map(|(symbol, bundle)| {
						(symbol.clone(), bundle.as_str().unwrap_or("").to_string())
					})
					.collect()
			})
			.unwrap_or_default();
		apps.push(App {
			name: entry.name,
			render: entry.render.expect("render present when no error"),
			client_dir,
			chunk_map,
			manifest_hash: manifest["manifestHash"]
				.as_str()
				.unwrap_or("native")
				.to_string(),
		});
	}
	Host { apps, failed }
}

fn main() {
	let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../../../..");
	let apps_dir = std::env::var("QWIK_APPS_DIR")
		.map(PathBuf::from)
		.unwrap_or_else(|_| repo_root.join("e2e/qwik-e2e/apps"));
	let host = Arc::new(load_apps(&apps_dir));

	let port: u16 = std::env::args()
		.nth(1)
		.and_then(|argument| argument.parse().ok())
		.unwrap_or(3310);
	let listener = TcpListener::bind(("127.0.0.1", port)).expect("bind");
	println!("qwik-ssr-host listening on http://127.0.0.1:{port}/");
	for app in &host.apps {
		println!("  http://127.0.0.1:{port}/{}/", app.name);
	}
	for (name, reason) in &host.failed {
		println!("  ❌ {name}: {reason}");
	}
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
		let html = homepage(host);
		respond(
			&mut stream,
			200,
			"text/html; charset=utf-8",
			html.as_bytes(),
		);
		return;
	}
	let mut segments = path.splitn(3, '/').skip(1);
	let app_name = segments.next().unwrap_or("");
	let rest = segments.next().unwrap_or("");
	let Some(app) = host.apps.iter().find(|app| app.name == app_name) else {
		respond(&mut stream, 404, "text/plain", b"not found");
		return;
	};
	if let Some(file) = rest.strip_prefix("build/") {
		// fail closed on any traversal shape
		if file.contains("..") || file.contains('/') {
			respond(&mut stream, 404, "text/plain", b"not found");
			return;
		}
		let full = app.client_dir.join("build").join(file);
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
	// every non-chunk path renders the app page, like the JS dev server
	let html = render(app, counter);
	respond(
		&mut stream,
		200,
		"text/html; charset=utf-8",
		html.as_bytes(),
	);
}

fn homepage(host: &Host) -> String {
	let mut list = String::new();
	for app in &host.apps {
		list.push_str(&format!(
			"<li><a href=\"/{name}/\">{name}</a></li>",
			name = app.name
		));
	}
	for (name, reason) in &host.failed {
		list.push_str(&format!(
			"<li>❌ {name} — {}</li>",
			qwik_ssr_rt::escape::escape_html(reason)
		));
	}
	if list.is_empty() {
		list.push_str("<li>no apps built — run <code>pnpm serve.native</code></li>");
	}
	format!(
		"<!DOCTYPE html><html><head><title>Native SSR Host</title></head><body><h1>🦀 Native SSR Host</h1><ul>{list}</ul></body></html>"
	)
}

fn render(app: &App, counter: u64) -> String {
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
			base: format!("/{}/build/", app.name),
			locale: String::new(),
			manifest_hash: app.manifest_hash.clone(),
			instance_hash: instance,
		},
		qwik_loader: generated::QWIK_LOADER.to_string(),
		streaming: false,
		chunk_map: Some(app.chunk_map.clone()),
	};
	let page = qwik_ssr_rt::render::render_page(&options, app.render);
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
