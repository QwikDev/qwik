use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::parse::PathData;

// EntryStrategies
#[derive(Debug, Serialize, Deserialize)]
pub enum Bundling {
    Single,
    PerHook,
    Manual(Vec<Vec<String>>),
}
pub trait BundlingPolicy {
    fn get_entry_for_sym(&self, symbol: &str, path: &PathData) -> Option<String>;
}

#[derive(Default)]
pub struct SingleBundle {}

impl BundlingPolicy for SingleBundle {
    fn get_entry_for_sym(&self, _symbol: &str, _path: &PathData) -> Option<String> {
        Some("entry_hooks".to_string())
    }
}

#[derive(Default)]
pub struct PerHookBundle {}

impl BundlingPolicy for PerHookBundle {
    fn get_entry_for_sym(&self, symbol: &str, path: &PathData) -> Option<String> {
        return None
    }
}
pub struct ManualBundle {
    map: HashMap<String, String>,
    fallback: String,
}

impl ManualBundle {
    pub fn new(groups: &[Vec<String>]) -> Self {
        let mut map: HashMap<String, String> = HashMap::new();
        for (count, group) in groups.iter().enumerate() {
            let group_name = format!("entry_{}", count);
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

impl BundlingPolicy for ManualBundle {
    fn get_entry_for_sym(&self, symbol: &str, _path: &PathData) -> Option<String> {
        let entry = self.map.get(symbol);
        Some(match entry {
            Some(val) => val.clone(),
            None => self.fallback.clone(),
        })
    }
}

pub fn parse_bundling(bundling: &Bundling) -> Box<dyn BundlingPolicy> {
    match bundling {
        Bundling::Single => Box::new(SingleBundle::default()),
        Bundling::PerHook => Box::new(PerHookBundle::default()),
        Bundling::Manual(ref groups) => Box::new(ManualBundle::new(groups)),
    }
}
