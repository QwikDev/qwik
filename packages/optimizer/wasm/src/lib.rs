#![deny(clippy::all)]
#![deny(clippy::perf)]
#![deny(clippy::nursery)]

use js_sys::Error;
use qwik_core::TransformModulesOptions;
use serde::ser::Serialize;
use serde_wasm_bindgen::{from_value, Serializer};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn transform_modules(config_val: JsValue) -> Result<JsValue, JsValue> {
	let config: TransformModulesOptions = from_value(config_val).map_err(JsValue::from)?;

	let result = qwik_core::transform_modules(config)
		.map_err(|e| Error::from(JsValue::from_str(&e.to_string())))?;

	let serializer = Serializer::new().serialize_maps_as_objects(true);
	result.serialize(&serializer).map_err(JsValue::from)
}

// #[wasm_bindgen]
// pub fn transform_code(config_val: JsValue) -> Result<JsValue, JsValue> {
//   let input: String = from_value(config_val).map_err(JsValue::from)?;

//   let result = qwik_core::transform_modules(&TransformModulesOptions {
//     src_dir: "/project".to_string(),
//     transpile: true,
//     minify: MinifyMode::Minify,
//     entry_strategy: EntryStrategy::PerComponent,
//     source_maps: false,
//     input: vec![TransformModuleInput {
//       code: input,
//       path: "index.tsx".to_string(),
//     }],
//   })
//   .map_err(|e| Error::from(JsValue::from_str(&e.to_string())))?;

//   let serializer = Serializer::new().serialize_maps_as_objects(true);
//   result.serialize(&serializer).map_err(JsValue::from)
// }
