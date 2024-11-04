#![deny(clippy::all)]
#![deny(clippy::perf)]
#![deny(clippy::nursery)]

extern crate napi;
#[macro_use]
extern crate napi_derive;

use napi::{CallContext, JsObject, Result};
use tokio::task;

#[cfg(windows)]
#[global_allocator]
static ALLOC: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[allow(clippy::needless_pass_by_value)]
#[js_function(1)]
fn transform_modules(ctx: CallContext) -> Result<JsObject> {
	let opts = ctx.get::<JsObject>(0)?;
	let config: qwik_core::TransformModulesOptions = ctx.env.from_js_value(opts)?;

	ctx.env.execute_tokio_future(
		async move {
			// Spawn the CPU-intensive work onto a separate thread in the thread pool
			let result = task::spawn_blocking(move || qwik_core::transform_modules(config))
				.await
				.unwrap()
				.map_err(|e| napi::Error::from_reason(e.to_string()))?;

			Ok(result)
		},
		|env, result| env.to_js_value(&result),
	)
}

#[module_exports]
fn init(mut exports: JsObject) -> Result<()> {
	exports.create_named_method("transform_modules", transform_modules)?;

	Ok(())
}
