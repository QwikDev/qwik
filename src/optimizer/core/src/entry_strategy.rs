use crate::collector::HookCollect;
use crate::parse::PathData;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use swc_atoms::JsWord;
use swc_ecmascript::ast::Expr;

use lazy_static::lazy_static;

lazy_static! {
    static ref ENTRY_HOOKS: JsWord = JsWord::from("entry_hooks");
    static ref ENTRY_SERVER: JsWord = JsWord::from("entry_server");
}

// EntryStrategies
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EntryStrategy {
    Single,
    Hook,
    Component,
    Smart,
    Manual(Vec<Vec<String>>),
}

pub trait EntryPolicy: Send + Sync {
    fn get_entry_for_sym(
        &self,
        symbol_name: &str,
        location: &PathData,
        context: &[String],
        analytics: &HookCollect,
        expr: &Expr,
    ) -> Option<JsWord>;
}

#[derive(Default, Clone)]
pub struct SingleStrategy;

impl EntryPolicy for SingleStrategy {
    fn get_entry_for_sym(
        &self,
        _symbol: &str,
        _path: &PathData,
        _context: &[String],
        _analytics: &HookCollect,
        _expr: &Expr,
    ) -> Option<JsWord> {
        Some(ENTRY_HOOKS.clone())
    }
}

#[derive(Default, Clone)]
pub struct PerHookStrategy {}

impl EntryPolicy for PerHookStrategy {
    fn get_entry_for_sym(
        &self,
        _symbol: &str,
        _path: &PathData,
        _context: &[String],
        _analytics: &HookCollect,
        _expr: &Expr,
    ) -> Option<JsWord> {
        None
    }
}

#[derive(Default, Clone)]
pub struct PerComponentStrategy {}

impl EntryPolicy for PerComponentStrategy {
    fn get_entry_for_sym(
        &self,
        _symbol: &str,
        _path: &PathData,
        context: &[String],
        _analytics: &HookCollect,
        _expr: &Expr,
    ) -> Option<JsWord> {
        context.first().map_or_else(
            || Some(ENTRY_HOOKS.clone()),
            |root| Some(JsWord::from(["entry_", root].concat())),
        )
    }
}

#[derive(Default, Clone)]
pub struct SmartStrategy;

impl EntryPolicy for SmartStrategy {
    fn get_entry_for_sym(
        &self,
        _symbol: &str,
        _path: &PathData,
        context: &[String],
        _analytics: &HookCollect,
        _expr: &Expr,
    ) -> Option<JsWord> {
        if context.iter().any(|h| h == "onMount") {
            return Some(ENTRY_SERVER.clone());
        }
        Some(context.first().map_or_else(
            || ENTRY_HOOKS.clone(),
            |root| JsWord::from(["entry_", root].concat()),
        ))
    }
}

#[derive(Default, Clone)]
pub struct ManualStrategy {
    map: HashMap<String, JsWord>,
    fallback: JsWord,
}

impl ManualStrategy {
    pub fn new(groups: Vec<Vec<String>>) -> Self {
        let mut map: HashMap<String, JsWord> = HashMap::new();
        for (count, group) in groups.into_iter().enumerate() {
            let group_name = JsWord::from(format!("entry_{}", count));
            for sym in group {
                map.insert(sym, group_name.clone());
            }
        }
        Self {
            map,
            fallback: ENTRY_HOOKS.clone(),
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
        _expr: &Expr,
    ) -> Option<JsWord> {
        let entry = self.map.get(symbol);
        Some(match entry {
            Some(val) => val.clone(),
            None => self.fallback.clone(),
        })
    }
}

pub fn parse_entry_strategy(strategy: EntryStrategy) -> Box<dyn EntryPolicy> {
    match strategy {
        EntryStrategy::Single => Box::new(SingleStrategy::default()),
        EntryStrategy::Hook => Box::new(PerHookStrategy::default()),
        EntryStrategy::Component => Box::new(PerComponentStrategy::default()),
        EntryStrategy::Smart => Box::new(SmartStrategy::default()),
        EntryStrategy::Manual(groups) => Box::new(ManualStrategy::new(groups)),
    }
}
