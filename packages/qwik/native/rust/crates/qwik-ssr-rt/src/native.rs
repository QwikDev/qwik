//! Author-facing surface for `native$` implementations (specs/09). The generator calls every
//! plugin fn through one untyped ABI — `&[Rc<SerdesValue>] -> Rc<SerdesValue>` — because the wire
//! carries no signature. `native_fn!` writes that shim so the implementation is plain Rust.

use crate::serdes::{SerdesValue, SignalState};
use std::cell::RefCell;
use std::rc::Rc;

/// A reactive cell, not plain data: the serializer walks it and clients subscribe to it, so a
/// signal-valued field stays a signal all the way through the boundary.
pub struct Signal<T>(pub T);

impl<T> Signal<T> {
	pub fn new(value: T) -> Self {
		Signal(value)
	}
}

pub trait FromSerdes: Sized {
	fn from_serdes(value: &SerdesValue) -> Result<Self, String>;
}

pub trait IntoSerdes {
	fn into_serdes(self) -> Rc<SerdesValue>;
}

/// Reads one argument for `native_fn!`. A mismatch is a codegen or authoring bug, never user
/// input, so it panics naming the function and parameter instead of coercing.
pub fn arg<T: FromSerdes>(
	args: &[Rc<SerdesValue>],
	index: usize,
	fn_name: &str,
	arg_name: &str,
) -> T {
	let Some(value) = args.get(index) else {
		panic!("native fn {fn_name}: missing argument {index} ({arg_name})");
	};
	T::from_serdes(value)
		.unwrap_or_else(|reason| panic!("native fn {fn_name}: argument {arg_name}: {reason}"))
}

fn kind_of(value: &SerdesValue) -> &'static str {
	match value {
		SerdesValue::Undefined => "undefined",
		SerdesValue::Null => "null",
		SerdesValue::Bool(_) => "boolean",
		SerdesValue::Number(_) => "number",
		SerdesValue::String(_) => "string",
		SerdesValue::Array(_) => "array",
		SerdesValue::Object(_) => "object",
		SerdesValue::Signal(_) => "signal",
		_ => "value",
	}
}

macro_rules! from_serdes_number {
	($($ty:ty),*) => {
		$(impl FromSerdes for $ty {
			fn from_serdes(value: &SerdesValue) -> Result<Self, String> {
				match value {
					SerdesValue::Number(number) => Ok(*number as $ty),
					other => Err(format!("expected number, got {}", kind_of(other))),
				}
			}
		})*
	};
}
from_serdes_number!(f64, u64, i64, usize);

impl FromSerdes for bool {
	fn from_serdes(value: &SerdesValue) -> Result<Self, String> {
		match value {
			SerdesValue::Bool(flag) => Ok(*flag),
			other => Err(format!("expected boolean, got {}", kind_of(other))),
		}
	}
}

impl FromSerdes for String {
	fn from_serdes(value: &SerdesValue) -> Result<Self, String> {
		match value {
			SerdesValue::String(text) => Ok(text.clone()),
			other => Err(format!("expected string, got {}", kind_of(other))),
		}
	}
}

macro_rules! into_serdes_number {
	($($ty:ty),*) => {
		$(impl IntoSerdes for $ty {
			fn into_serdes(self) -> Rc<SerdesValue> {
				Rc::new(SerdesValue::Number(self as f64))
			}
		})*
	};
}
into_serdes_number!(f64, u64, i64, usize);

impl IntoSerdes for bool {
	fn into_serdes(self) -> Rc<SerdesValue> {
		Rc::new(SerdesValue::Bool(self))
	}
}

impl IntoSerdes for String {
	fn into_serdes(self) -> Rc<SerdesValue> {
		Rc::new(SerdesValue::String(self))
	}
}

impl<T: IntoSerdes> IntoSerdes for Vec<T> {
	fn into_serdes(self) -> Rc<SerdesValue> {
		Rc::new(SerdesValue::Array(
			self.into_iter().map(IntoSerdes::into_serdes).collect(),
		))
	}
}

impl<T: IntoSerdes> IntoSerdes for Option<T> {
	fn into_serdes(self) -> Rc<SerdesValue> {
		match self {
			Some(value) => value.into_serdes(),
			None => Rc::new(SerdesValue::Undefined),
		}
	}
}

impl<T: IntoSerdes> IntoSerdes for Signal<T> {
	fn into_serdes(self) -> Rc<SerdesValue> {
		Rc::new(SerdesValue::Signal(RefCell::new(SignalState {
			value: self.0.into_serdes(),
			subs: Vec::new(),
		})))
	}
}

/// Escape hatch for shapes the traits do not cover yet.
impl IntoSerdes for Rc<SerdesValue> {
	fn into_serdes(self) -> Rc<SerdesValue> {
		self
	}
}

/// Defines a `native$` implementation with plain Rust types, generating the untyped ABI the
/// generator calls.
///
/// ```ignore
/// qwik_ssr_rt::native_fn! {
///     pub fn double(value: f64) -> f64 { value * 2.0 }
/// }
/// ```
#[macro_export]
macro_rules! native_fn {
	(
		$(#[$attr:meta])*
		pub fn $name:ident($($arg:ident: $arg_ty:ty),* $(,)?) -> $ret:ty $body:block
	) => {
		$(#[$attr])*
		#[allow(non_snake_case)]
		pub fn $name(
			args: &[::std::rc::Rc<$crate::serdes::SerdesValue>],
		) -> ::std::rc::Rc<$crate::serdes::SerdesValue> {
			fn implementation($($arg: $arg_ty),*) -> $ret $body
			#[allow(unused_mut)]
			let mut index = 0usize;
			$(
				let $arg: $arg_ty =
					$crate::native::arg(args, index, stringify!($name), stringify!($arg));
				index += 1;
			)*
			let _ = index;
			$crate::native::IntoSerdes::into_serdes(implementation($($arg),*))
		}
	};
}
