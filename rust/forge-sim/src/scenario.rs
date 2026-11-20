use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::{Rng, SimError};

pub const MAX_STEPS: usize = 500;
pub const MAX_FAULTS: usize = 100;

/// The scenario format this version of the rules reads.
pub const SCENARIO_FORMAT: u32 = 1;

/// A procedure to carry out: steps, the order they depend on, and what they are worth.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scenario {
    pub id: String,
    /// Must equal [`SCENARIO_FORMAT`].
    pub format: u32,
    pub steps: Vec<Step>,
    /// Score (0–100) needed to pass, on top of doing every required step.
    pub pass_score: u32,
    /// Points lost each time a step is performed before its prerequisites.
    #[serde(default)]
    pub penalty_points: u32,
    /// Conditions a run may start in. The launch seed picks one, so learners can't
    /// memorise a single run.
    #[serde(default)]
    pub faults: Vec<Fault>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Step {
    pub id: String,
    pub points: u32,
    /// A run can't pass without it.
    #[serde(default)]
    pub required: bool,
    /// Steps that must already be done.
    #[serde(default)]
    pub after: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Fault {
    pub id: String,
    /// Steps that become required when this fault is the one in play.
    pub requires: Vec<String>,
}

impl Scenario {
    pub fn step(&self, id: &str) -> Option<&Step> {
        self.steps.iter().find(|s| s.id == id)
    }

    /// The fault a seed selects; `None` when the scenario has no faults.
    pub fn fault_for(&self, seed: u64) -> Option<&Fault> {
        if self.faults.is_empty() {
            return None;
        }
        let pick = Rng::new(seed).below(self.faults.len() as u64);
        self.faults.get(usize::try_from(pick).ok()?)
    }

    pub fn is_required(&self, step: &Step, fault: Option<&Fault>) -> bool {
        step.required || fault.is_some_and(|f| f.requires.contains(&step.id))
    }

    pub fn validate(&self) -> Result<(), SimError> {
        let bad = |why: String| Err(SimError::BadScenario(why));
        if self.format != SCENARIO_FORMAT {
            return bad(format!(
                "format {} isn't supported (expected {SCENARIO_FORMAT})",
                self.format
            ));
        }
        if self.id.trim().is_empty() {
            return bad("id is required".into());
        }
        if self.steps.is_empty() || self.steps.len() > MAX_STEPS {
            return bad(format!("needs 1 to {MAX_STEPS} steps"));
        }
        if self.faults.len() > MAX_FAULTS {
            return bad(format!("at most {MAX_FAULTS} faults"));
        }
        if self.pass_score > 100 {
            return bad("passScore must be 0 to 100".into());
        }

        let mut ids = BTreeSet::new();
        let mut total: u32 = 0;
        for step in &self.steps {
            if step.id.trim().is_empty() {
                return bad("every step needs an id".into());
            }
            if !ids.insert(step.id.as_str()) {
                return bad(format!("step id {:?} is used twice", step.id));
            }
            total = match total.checked_add(step.points) {
                Some(sum) => sum,
                None => return bad("step points add up to more than a u32".into()),
            };
        }
        if total == 0 {
            return bad("the steps are worth no points".into());
        }
        for step in &self.steps {
            for dep in &step.after {
                if !ids.contains(dep.as_str()) {
                    return bad(format!(
                        "step {:?} comes after unknown step {dep:?}",
                        step.id
                    ));
                }
            }
        }
        if let Some(id) = self.step_in_a_cycle() {
            return bad(format!(
                "step {id:?} can never be done: its prerequisites form a loop"
            ));
        }

        let mut fault_ids = BTreeSet::new();
        for fault in &self.faults {
            if fault.id.trim().is_empty() || !fault_ids.insert(fault.id.as_str()) {
                return bad("fault ids must be present and unique".into());
            }
            for id in &fault.requires {
                if !ids.contains(id.as_str()) {
                    return bad(format!("fault {:?} requires unknown step {id:?}", fault.id));
                }
            }
        }
        Ok(())
    }

    /// A step that can never be completed because its prerequisites loop (Kahn's algorithm).
    fn step_in_a_cycle(&self) -> Option<&str> {
        let mut waiting: BTreeMap<&str, usize> = self
            .steps
            .iter()
            .map(|s| (s.id.as_str(), s.after.len()))
            .collect();
        let mut ready: Vec<&str> = waiting
            .iter()
            .filter(|(_, n)| **n == 0)
            .map(|(id, _)| *id)
            .collect();
        let mut cleared = 0;
        while let Some(id) = ready.pop() {
            cleared += 1;
            for step in &self.steps {
                let uses = step.after.iter().filter(|dep| dep.as_str() == id).count();
                if uses == 0 {
                    continue;
                }
                let left = waiting.get_mut(step.id.as_str())?;
                *left -= uses;
                if *left == 0 {
                    ready.push(step.id.as_str());
                }
            }
        }
        if cleared == self.steps.len() {
            return None;
        }
        waiting.into_iter().find(|(_, n)| *n > 0).map(|(id, _)| id)
    }
}
