use crate::collector::HookCollect;
use crate::parse::PathData;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use swc_atoms::JsWord;
use swc_ecmascript::ast::CallExpr;

// EntryStrategies
#[derive(Debug, Serialize, Deserialize)]
pub enum EntryStrategy {
    Single,
    PerHook,
    PerComponent,
    Manual(Vec<Vec<String>>),
}
pub trait EntryPolicy {
    fn get_entry_for_sym(
        &self,
        symbol_name: &str,
        location: &PathData,
        context: &[String],
        analytics: &HookCollect,
        expr: &CallExpr,
    ) -> Option<String>;
}

#[derive(Default)]
pub struct SingleStrategy {}

impl EntryPolicy for SingleStrategy {
    fn get_entry_for_sym(
        &self,
        _symbol: &str,
        _path: &PathData,
        _context: &[String],
        _analytics: &HookCollect,
        _expr: &CallExpr,
    ) -> Option<String> {
        Some("entry_hooks".to_string())
    }
}

#[derive(Default)]
pub struct PerHookStrategy {}

impl EntryPolicy for PerHookStrategy {
    fn get_entry_for_sym(
        &self,
        _symbol: &str,
        _path: &PathData,
        _context: &[String],
        _analytics: &HookCollect,
        _expr: &CallExpr,
    ) -> Option<String> {
        None
    }
}

#[derive(Default)]
pub struct PerComponentStrategy {}

impl EntryPolicy for PerComponentStrategy {
    fn get_entry_for_sym(
        &self,
        _symbol: &str,
        _path: &PathData,
        context: &[String],
        _analytics: &HookCollect,
        _expr: &CallExpr,
    ) -> Option<String> {
        if let Some(root) = context.first() {
            Some(["entry_", root].concat())
        } else {
            Some("entry-fallback".to_string())
        }
    }
}
pub struct ManualStrategy {
    map: HashMap<String, JsWord>,
    fallback: String,
}

impl ManualStrategy {
    pub fn new(groups: &[Vec<String>]) -> Self {
        let mut map: HashMap<String, JsWord> = HashMap::new();
        for (count, group) in groups.iter().enumerate() {
            let group_name = JsWord::from(format!("entry_{}", count));
            for sym in group {
                map.insert(sym.clone(), group_name.clone());
            }
        }
        Self {
            map,
            fallback: "entry-fallback".to_string(),
        }
    }
}

impl EntryPolicy for ManualStrategy {
    fn get_entry_for_sym(
        &self,
        symbol: &str,
        _path: &PathData,
        _context: &[String],
        _analytics: &HookCollect,
        _expr: &CallExpr,
    ) -> Option<String> {
        let entry = self.map.get(symbol);
        Some(match entry {
            Some(val) => val.to_string(),
            None => self.fallback.clone(),
        })
    }
}

pub fn parse_entry_strategy(strategy: &EntryStrategy) -> Box<dyn EntryPolicy> {
    match strategy {
        EntryStrategy::Single => Box::new(SingleStrategy::default()),
        EntryStrategy::PerHook => Box::new(PerHookStrategy::default()),
        EntryStrategy::PerComponent => Box::new(PerComponentStrategy::default()),
        EntryStrategy::Manual(ref groups) => Box::new(ManualStrategy::new(groups)),
    }
}
