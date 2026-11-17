use crate::transform::SegmentData;
use serde::{Deserialize, Serialize};
use swc_atoms::Atom;

use lazy_static::lazy_static;

lazy_static! {
	static ref ENTRY_SEGMENTS: Atom = Atom::from("entry_segments");
}

// EntryStrategies
#[derive(Debug, Serialize, Copy, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EntryStrategy {
	Inline,
	Hoist,
	Single,
	Hook,
	Segment,
	Component,
	Smart,
}

pub trait EntryPolicy: Send + Sync {
	fn get_entry_for_sym(&self, context: &[String], segment: &SegmentData) -> Option<Atom>;
}

#[derive(Default, Clone)]
pub struct InlineStrategy;

impl EntryPolicy for InlineStrategy {
	fn get_entry_for_sym(&self, _context: &[String], _segment: &SegmentData) -> Option<Atom> {
		Some(ENTRY_SEGMENTS.clone())
	}
}

#[derive(Clone)]
pub struct SingleStrategy {}

impl SingleStrategy {
	pub const fn new() -> Self {
		Self {}
	}
}

impl EntryPolicy for SingleStrategy {
	fn get_entry_for_sym(&self, _context: &[String], _segment: &SegmentData) -> Option<Atom> {
		Some(ENTRY_SEGMENTS.clone())
	}
}

#[derive(Clone)]
pub struct PerSegmentStrategy {}

impl PerSegmentStrategy {
	pub const fn new() -> Self {
		Self {}
	}
}

impl EntryPolicy for PerSegmentStrategy {
	fn get_entry_for_sym(&self, _context: &[String], _segment: &SegmentData) -> Option<Atom> {
		None
	}
}

#[derive(Clone)]
pub struct PerComponentStrategy {}

impl PerComponentStrategy {
	pub const fn new() -> Self {
		Self {}
	}
}

impl EntryPolicy for PerComponentStrategy {
	fn get_entry_for_sym(&self, context: &[String], segment: &SegmentData) -> Option<Atom> {
		context.first().map_or_else(
			|| Some(ENTRY_SEGMENTS.clone()),
			|root| Some(Atom::from([&segment.origin, "_entry_", root].concat())),
		)
	}
}

#[derive(Clone)]
pub struct SmartStrategy {}

impl SmartStrategy {
	pub const fn new() -> Self {
		Self {}
	}
}

impl EntryPolicy for SmartStrategy {
	fn get_entry_for_sym(&self, context: &[String], segment: &SegmentData) -> Option<Atom> {
		// Render stays apart: resolving any other QRL must not load it
		let group = match segment.ctx_name.as_ref() {
			"component$" | "useStyles$" | "useStylesScoped$" => "_render_",
			_ => "_entry_",
		};
		// Top-level QRLs are put into a separate file
		context
			.first()
			.map(|root| Atom::from([&segment.origin, group, root].concat()))
	}
}

pub fn parse_entry_strategy(strategy: &EntryStrategy) -> Box<dyn EntryPolicy> {
	match strategy {
		EntryStrategy::Inline | EntryStrategy::Hoist => Box::<InlineStrategy>::default(),
		EntryStrategy::Hook => Box::new(PerSegmentStrategy::new()),
		EntryStrategy::Segment => Box::new(PerSegmentStrategy::new()),
		EntryStrategy::Single => Box::new(SingleStrategy::new()),
		EntryStrategy::Component => Box::new(PerComponentStrategy::new()),
		EntryStrategy::Smart => Box::new(SmartStrategy::new()),
	}
}
