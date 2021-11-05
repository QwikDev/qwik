use crate::parse::PathData;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use swc_atoms::JsWord;

// EntryStrategies
#[derive(Debug, Serialize, Deserialize)]
pub enum EntryStrategy {
    Single,
    PerHook,
    Manual(Vec<Vec<String>>),
}
pub trait EntryPolicy {
    fn get_entry_for_sym(&self, symbol: &str, path: &PathData) -> Option<String>;
}

#[derive(Default)]
pub struct SingleBundle {}

impl EntryPolicy for SingleBundle {
    fn get_entry_for_sym(&self, _symbol: &str, _path: &PathData) -> Option<String> {
        Some("entry_hooks".to_string())
    }
}

#[derive(Default)]
pub struct PerHookBundle {}

impl EntryPolicy for PerHookBundle {
    fn get_entry_for_sym(&self, _symbol: &str, _path: &PathData) -> Option<String> {
        None
    }
}
pub struct ManualBundle {
    map: HashMap<String, JsWord>,
    fallback: String,
}

impl ManualBundle {
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

impl EntryPolicy for ManualBundle {
    fn get_entry_for_sym(&self, symbol: &str, _path: &PathData) -> Option<String> {
        let entry = self.map.get(symbol);
        Some(match entry {
            Some(val) => val.to_string(),
            None => self.fallback.clone(),
        })
    }
}

pub fn parse_entry_strategy(strategy: &EntryStrategy) -> Box<dyn EntryPolicy> {
    match strategy {
        EntryStrategy::Single => Box::new(SingleBundle::default()),
        EntryStrategy::PerHook => Box::new(PerHookBundle::default()),
        EntryStrategy::Manual(ref groups) => Box::new(ManualBundle::new(groups)),
    }
}
