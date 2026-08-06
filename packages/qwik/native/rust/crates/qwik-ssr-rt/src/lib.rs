//! Qwik SSR runtime core — a pure-Rust implementation of the JS-semantics profile
//! (specs/06) and the SSR wire contract (specs/04, /05). Byte-compatibility with the
//! JS engine is enforced by the Layer-0 conformance goldens
//! (`packages/compiler/conformance/layer0/goldens`).

pub mod coerce;
pub mod escape;
pub mod json;
pub mod number;
pub mod value;
