//! The rules as a learner and an author meet them, through the JSON entry point.

use forge_sim::{replay, replay_json, validate_scenario_json, Action, Scenario, SimError};

/// Lockout/tagout on a hydraulic press. One of two faults is live per run.
const LOTO: &str = r#"{
  "id": "loto-press-01",
  "format": 1,
  "passScore": 80,
  "penaltyPoints": 5,
  "steps": [
    {"id": "notify",       "points": 10, "required": true},
    {"id": "shutdown",     "points": 10, "required": true, "after": ["notify"]},
    {"id": "isolate",      "points": 20, "required": true, "after": ["shutdown"]},
    {"id": "lock-tag",     "points": 20, "required": true, "after": ["isolate"]},
    {"id": "bleed-lines",  "points": 10, "after": ["lock-tag"]},
    {"id": "block-ram",    "points": 10, "after": ["lock-tag"]},
    {"id": "verify-zero",  "points": 20, "required": true, "after": ["lock-tag"]}
  ],
  "faults": [
    {"id": "residual-pressure", "requires": ["bleed-lines"]},
    {"id": "raised-ram",        "requires": ["block-ram"]}
  ]
}"#;

fn scenario() -> Scenario {
    serde_json::from_str(LOTO).unwrap()
}

fn log(steps: &[&str]) -> Vec<Action> {
    steps
        .iter()
        .enumerate()
        .map(|(i, step)| Action {
            t: i as u64 * 1000,
            step: (*step).into(),
        })
        .collect()
}

const ALL: [&str; 7] = [
    "notify",
    "shutdown",
    "isolate",
    "lock-tag",
    "bleed-lines",
    "block-ram",
    "verify-zero",
];

#[test]
fn a_clean_run_scores_full_marks() {
    let outcome = replay(&scenario(), 1, &log(&ALL)).unwrap();
    assert_eq!(
        (outcome.earned_points, outcome.total_points, outcome.score),
        (100, 100, 100)
    );
    assert!(outcome.passed && outcome.violations.is_empty());
    assert_eq!(outcome.duration_ms, 6000);
}

#[test]
fn the_same_inputs_always_give_the_same_outcome() {
    let (s, actions) = (scenario(), log(&ALL[..5]));
    assert_eq!(
        replay(&s, 42, &actions).unwrap(),
        replay(&s, 42, &actions).unwrap()
    );
}

#[test]
fn a_step_done_too_early_earns_nothing_and_costs_the_penalty() {
    let steps = [
        "notify",
        "isolate",
        "shutdown",
        "isolate",
        "lock-tag",
        "verify-zero",
    ];
    let outcome = replay(&scenario(), 1, &log(&steps)).unwrap();
    assert_eq!(outcome.violations.len(), 1);
    assert_eq!(outcome.violations[0].index, 1);
    assert_eq!(outcome.violations[0].missing, ["shutdown"]);
    // 80 earned (isolate still counts when redone properly), 5 lost.
    assert_eq!(
        (outcome.earned_points, outcome.penalty_points, outcome.score),
        (80, 5, 75)
    );
}

#[test]
fn repeating_a_completed_step_changes_nothing() {
    let once = replay(&scenario(), 1, &log(&ALL)).unwrap();
    let mut steps = ALL.to_vec();
    steps.insert(2, "notify");
    let twice = replay(&scenario(), 1, &log(&steps)).unwrap();
    assert_eq!(
        (once.score, once.completed_steps),
        (twice.score, twice.completed_steps)
    );
}

#[test]
fn the_seed_decides_which_fault_must_be_handled() {
    let s = scenario();
    let skip_bleed: Vec<&str> = ALL
        .iter()
        .copied()
        .filter(|x| *x != "bleed-lines")
        .collect();
    let mut seen = std::collections::BTreeSet::new();
    for seed in 0..40 {
        let outcome = replay(&s, seed, &log(&skip_bleed)).unwrap();
        let fault = outcome.fault_id.clone().unwrap();
        // 90 points either way; it only fails when the skipped step was the live fault.
        assert_eq!(outcome.score, 90);
        assert_eq!(outcome.passed, fault == "raised-ram", "seed {seed}");
        if !outcome.passed {
            assert_eq!(outcome.missed_required, ["bleed-lines"]);
        }
        seen.insert(fault);
    }
    assert_eq!(seen.len(), 2, "both faults should come up across seeds");
}

#[test]
fn a_high_score_still_fails_without_a_required_step() {
    let no_verify: Vec<&str> = ALL
        .iter()
        .copied()
        .filter(|x| *x != "verify-zero")
        .collect();
    let mut s = scenario();
    s.pass_score = 50;
    let outcome = replay(&s, 1, &log(&no_verify)).unwrap();
    assert_eq!(outcome.score, 80);
    assert!(!outcome.passed);
    assert_eq!(outcome.missed_required, ["verify-zero"]);
}

#[test]
fn penalties_never_take_the_score_below_zero() {
    let outcome = replay(&scenario(), 1, &log(&["verify-zero"; 30])).unwrap();
    assert_eq!((outcome.earned_points, outcome.score), (0, 0));
    assert_eq!(outcome.penalty_points, 150);
}

#[test]
fn an_impossible_log_is_rejected_not_scored() {
    let s = scenario();
    let unknown = replay(&s, 1, &log(&["notify", "teleport"]));
    assert!(matches!(unknown, Err(SimError::BadLog(ref why)) if why.contains("teleport")));

    let mut backwards = log(&["notify", "shutdown"]);
    backwards[1].t = 0;
    backwards[0].t = 5;
    assert!(matches!(
        replay(&s, 1, &backwards),
        Err(SimError::BadLog(_))
    ));

    let huge = log(&vec!["notify"; forge_sim::MAX_ACTIONS + 1]);
    assert!(matches!(replay(&s, 1, &huge), Err(SimError::BadLog(_))));
}

#[test]
fn json_in_json_out() {
    let actions = serde_json::to_string(&log(&ALL)).unwrap();
    let outcome: serde_json::Value =
        serde_json::from_str(&replay_json(LOTO, "18446744073709551615", &actions).unwrap())
            .unwrap();
    assert_eq!(outcome["rulesVersion"], 1);
    assert_eq!(outcome["scenarioId"], "loto-press-01");
    assert_eq!(outcome["passed"], true);
    assert_eq!(outcome["completedSteps"].as_array().unwrap().len(), 7);

    assert!(matches!(
        replay_json(LOTO, "-1", &actions),
        Err(SimError::BadLog(_))
    ));
    assert!(matches!(
        replay_json(LOTO, "1", "{}"),
        Err(SimError::BadLog(_))
    ));
    // Fields the rules don't know are refused, not silently dropped.
    let extra = r#"[{"t":0,"step":"notify","score":100}]"#;
    assert!(matches!(
        replay_json(LOTO, "1", extra),
        Err(SimError::BadLog(_))
    ));
}

#[test]
fn unplayable_scenarios_are_refused() {
    assert_eq!(validate_scenario_json(LOTO), Ok(()));
    let cases = [
        (
            r#"{"id":"s","format":2,"passScore":50,"steps":[{"id":"a","points":1}]}"#,
            "format",
        ),
        (
            r#"{"id":"s","format":1,"passScore":50,"steps":[]}"#,
            "steps",
        ),
        (
            r#"{"id":"s","format":1,"passScore":101,"steps":[{"id":"a","points":1}]}"#,
            "passScore",
        ),
        (
            r#"{"id":"s","format":1,"passScore":50,"steps":[{"id":"a","points":0}]}"#,
            "no points",
        ),
        (
            r#"{"id":"s","format":1,"passScore":50,"steps":[{"id":"a","points":1},{"id":"a","points":1}]}"#,
            "twice",
        ),
        (
            r#"{"id":"s","format":1,"passScore":50,"steps":[{"id":"a","points":1,"after":["z"]}]}"#,
            "unknown step",
        ),
        (
            r#"{"id":"s","format":1,"passScore":50,"steps":[{"id":"a","points":1,"after":["b"]},{"id":"b","points":1,"after":["a"]}]}"#,
            "loop",
        ),
        (
            r#"{"id":"s","format":1,"passScore":50,"steps":[{"id":"a","points":1,"after":["a"]}]}"#,
            "loop",
        ),
        (
            r#"{"id":"s","format":1,"passScore":50,"steps":[{"id":"a","points":1}],"faults":[{"id":"f","requires":["z"]}]}"#,
            "unknown step",
        ),
        (
            r#"{"id":"s","format":1,"passScore":50,"steps":[{"id":"a","points":4294967295},{"id":"b","points":1}]}"#,
            "u32",
        ),
    ];
    for (scenario, expected) in cases {
        match validate_scenario_json(scenario) {
            Err(SimError::BadScenario(why)) => assert!(why.contains(expected), "{why}"),
            other => panic!("expected a scenario error mentioning {expected:?}, got {other:?}"),
        }
    }
}
