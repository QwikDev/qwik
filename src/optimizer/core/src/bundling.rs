use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub enum Bundling {
    Single,
    PerHook,
    Manual(Vec<Vec<String>>),
}
pub trait BundlingPolicy {
    fn get_entry_for_sym(&self, symbol: &str, filename: &str) -> String;
}

#[derive(Default)]
pub struct SingleBundle {}

impl BundlingPolicy for SingleBundle {
    fn get_entry_for_sym(&self, _symbol: &str, _filename: &str) -> String {
        return "hook-entry.qwik".to_string();
    }
}

#[derive(Default)]
pub struct PerHookBundle {}

impl BundlingPolicy for PerHookBundle {
    fn get_entry_for_sym(&self, symbol: &str, filename: &str) -> String {
        return format!("h_{}_{}", filename, symbol);
    }
}
pub struct ManualBundle {
    map: HashMap<String, String>,
    fallback: String,
}

impl ManualBundle {
    pub fn new_with_groups(groups: &Vec<Vec<String>>) -> Self {
        let mut map: HashMap<String, String> = HashMap::new();
        let mut count = 0;
        for group in groups {
            let group_name = format!("entry_{}", count);
            for sym in group {
                map.insert(sym.clone(), group_name.clone());
            }
            count += 1;
        }
        ManualBundle {
            map: map,
            fallback: "entry-fallback".to_string(),
        }
    }
}

impl BundlingPolicy for ManualBundle {
    fn get_entry_for_sym(&self, symbol: &str, _filename: &str) -> String {
        let entry = self.map.get(symbol);
        match entry {
            Some(val) => val.clone(),
            None => self.fallback.clone(),
        }
    }
}

pub fn parse_bundling(bundling: &Bundling) -> Box<dyn BundlingPolicy> {
    match bundling {
        Bundling::Single => Box::new(SingleBundle::default()),
        Bundling::PerHook => Box::new(PerHookBundle::default()),
        Bundling::Manual(ref groups) => Box::new(ManualBundle::new_with_groups(groups)),
    }
}
