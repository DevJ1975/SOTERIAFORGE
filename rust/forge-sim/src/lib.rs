//! Deterministic rules and scoring for Soteria Forge simulators.
//!
//! The same crate runs in the game (Unity, through `forge-sim-ffi`) and on the server
//! (Django, through `forge-sim-py`). The game sends the server its action log, not a
//! score; the server calls [`replay`] with the same scenario and seed and records the
//! score it computes itself.
//!
//! Rules for anything added here, so every platform gets the same answer:
//! - no I/O, no clock, no threads, no global state;
//! - integer arithmetic only for anything that reaches the score;
//! - randomness only from [`Rng`], seeded by the launch;
//! - a change in behaviour bumps [`RULES_VERSION`], because a log recorded under one
//!   version must be replayed under the same one.

mod rng;
mod scenario;

use std::collections::BTreeSet;
use std::fmt;

use serde::{Deserialize, Serialize};

pub use rng::Rng;
pub use scenario::{Fault, Scenario, Step};

/// Bumped on any change that could alter a replay's result.
pub const RULES_VERSION: u32 = 1;

/// Upper bound on a log, so replaying an untrusted one costs bounded work.
pub const MAX_ACTIONS: usize = 10_000;

/// One thing the learner did, in the order it happened.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Action {
    /// Milliseconds since the run started. Never decreases through a log.
    pub t: u64,
    /// The step performed.
    pub step: String,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ViolationKind {
    /// A step was performed before a step it depends on.
    OutOfOrder,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Violation {
    /// Index of the action in the log.
    pub index: usize,
    pub step: String,
    pub kind: ViolationKind,
    /// The prerequisite steps that had not been done.
    pub missing: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub rules_version: u32,
    pub scenario_id: String,
    /// The fault this seed selected, if the scenario has any.
    pub fault_id: Option<String>,
    pub earned_points: u32,
    pub total_points: u32,
    pub penalty_points: u32,
    /// 0–100, rounded half up.
    pub score: u32,
    /// Every required step done, and `score` at or above the scenario's pass mark.
    pub passed: bool,
    pub completed_steps: Vec<String>,
    pub missed_required: Vec<String>,
    pub violations: Vec<Violation>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SimError {
    /// The scenario is malformed. An authoring problem, never the learner's.
    BadScenario(String),
    /// The action log is malformed or impossible. Treat as tampering or a client bug.
    BadLog(String),
}

impl fmt::Display for SimError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SimError::BadScenario(why) => write!(f, "bad scenario: {why}"),
            SimError::BadLog(why) => write!(f, "bad action log: {why}"),
        }
    }
}

impl std::error::Error for SimError {}

/// Replay a run and score it.
///
/// A step earns its points the first time it is performed with every step it depends
/// on already done. Performed too early it earns nothing, costs the scenario's
/// penalty, and can still be done properly later. Repeating a completed step changes
/// nothing.
pub fn replay(scenario: &Scenario, seed: u64, actions: &[Action]) -> Result<Outcome, SimError> {
    scenario.validate()?;
    if actions.len() > MAX_ACTIONS {
        return Err(SimError::BadLog(format!(
            "{} actions; at most {MAX_ACTIONS}",
            actions.len()
        )));
    }

    let fault = scenario.fault_for(seed);
    let mut done: BTreeSet<&str> = BTreeSet::new();
    let mut completed = Vec::new();
    let mut violations = Vec::new();
    let mut earned: u32 = 0;
    let mut last_t: u64 = 0;

    for (index, action) in actions.iter().enumerate() {
        if action.t < last_t {
            return Err(SimError::BadLog(format!(
                "action {index} goes back in time"
            )));
        }
        last_t = action.t;
        let Some(step) = scenario.step(&action.step) else {
            return Err(SimError::BadLog(format!(
                "action {index}: no step {:?} in this scenario",
                action.step
            )));
        };
        if done.contains(step.id.as_str()) {
            continue;
        }
        let missing: Vec<String> = step
            .after
            .iter()
            .filter(|id| !done.contains(id.as_str()))
            .cloned()
            .collect();
        if missing.is_empty() {
            done.insert(step.id.as_str());
            completed.push(step.id.clone());
            earned += step.points;
        } else {
            violations.push(Violation {
                index,
                step: step.id.clone(),
                kind: ViolationKind::OutOfOrder,
                missing,
            });
        }
    }

    let total: u32 = scenario.steps.iter().map(|s| s.points).sum();
    let penalty = scenario
        .penalty_points
        .saturating_mul(u32::try_from(violations.len()).unwrap_or(u32::MAX));
    let net = earned.saturating_sub(penalty);
    let score = percent(net, total);
    let missed_required: Vec<String> = scenario
        .steps
        .iter()
        .filter(|s| scenario.is_required(s, fault) && !done.contains(s.id.as_str()))
        .map(|s| s.id.clone())
        .collect();

    Ok(Outcome {
        rules_version: RULES_VERSION,
        scenario_id: scenario.id.clone(),
        fault_id: fault.map(|f| f.id.clone()),
        earned_points: earned,
        total_points: total,
        penalty_points: penalty,
        score,
        passed: missed_required.is_empty() && score >= scenario.pass_score,
        completed_steps: completed,
        missed_required,
        violations,
        duration_ms: last_t,
    })
}

/// `part / whole` as a whole percentage, rounded half up; 0 when `whole` is 0.
fn percent(part: u32, whole: u32) -> u32 {
    if whole == 0 {
        return 0;
    }
    let (part, whole) = (u64::from(part), u64::from(whole));
    u32::try_from((part * 200 + whole) / (whole * 2)).unwrap_or(100)
}

/// [`replay`] over JSON text: the form both bindings expose.
///
/// Returns the [`Outcome`] as JSON. `seed` is a decimal string because JSON numbers
/// and C# / JavaScript doubles can't carry every 64-bit value.
pub fn replay_json(scenario: &str, seed: &str, actions: &str) -> Result<String, SimError> {
    let scenario: Scenario =
        serde_json::from_str(scenario).map_err(|e| SimError::BadScenario(e.to_string()))?;
    let seed: u64 = seed
        .trim()
        .parse()
        .map_err(|_| SimError::BadLog("seed must be an unsigned 64-bit integer".into()))?;
    let actions: Vec<Action> =
        serde_json::from_str(actions).map_err(|e| SimError::BadLog(e.to_string()))?;
    let outcome = replay(&scenario, seed, &actions)?;
    Ok(serde_json::to_string(&outcome).expect("an Outcome always serializes"))
}

/// Check a scenario without running it (for authoring tools). `Ok` means playable.
pub fn validate_scenario_json(scenario: &str) -> Result<(), SimError> {
    let scenario: Scenario =
        serde_json::from_str(scenario).map_err(|e| SimError::BadScenario(e.to_string()))?;
    scenario.validate()
}

#[cfg(test)]
mod tests {
    use super::percent;

    #[test]
    fn percent_rounds_half_up_like_the_quiz_grader() {
        assert_eq!(percent(1, 8), 13); // 12.5
        assert_eq!(percent(1, 3), 33);
        assert_eq!(percent(2, 3), 67);
        assert_eq!(percent(0, 0), 0);
        assert_eq!(percent(u32::MAX, u32::MAX), 100);
    }
}
