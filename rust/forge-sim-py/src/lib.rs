//! Python module `forge_sim`: the server's side of simulator scoring.
//!
//! Django imports this and replays a learner's action log, so the score it records is
//! one it computed itself. See `backend/apps/games/sim.py`.

use forge_sim::SimError;
use pyo3::create_exception;
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

create_exception!(
    forge_sim,
    ScenarioError,
    PyValueError,
    "The scenario is malformed."
);
create_exception!(
    forge_sim,
    ActionLogError,
    PyValueError,
    "The action log is malformed or impossible."
);

fn raise(error: SimError) -> PyErr {
    match error {
        SimError::BadScenario(why) => ScenarioError::new_err(why),
        SimError::BadLog(why) => ActionLogError::new_err(why),
    }
}

/// replay(scenario: str, seed: int, actions: str) -> str
///
/// Replay a run and return its outcome. `scenario` and `actions` are JSON text and so
/// is the result. Raises ScenarioError or ActionLogError.
#[pyfunction]
fn replay(py: Python<'_>, scenario: &str, seed: u64, actions: &str) -> PyResult<String> {
    // Pure computation on Rust-owned data: let other Python threads run meanwhile.
    py.detach(|| forge_sim::replay_json(scenario, &seed.to_string(), actions))
        .map_err(raise)
}

/// validate_scenario(scenario: str) -> None
///
/// Raise ScenarioError unless the scenario (JSON text) is playable.
#[pyfunction]
fn validate_scenario(scenario: &str) -> PyResult<()> {
    forge_sim::validate_scenario_json(scenario).map_err(raise)
}

#[pymodule(name = "forge_sim")]
fn forge_sim_module(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(replay, m)?)?;
    m.add_function(wrap_pyfunction!(validate_scenario, m)?)?;
    m.add("RULES_VERSION", forge_sim::RULES_VERSION)?;
    m.add("ScenarioError", m.py().get_type::<ScenarioError>())?;
    m.add("ActionLogError", m.py().get_type::<ActionLogError>())?;
    Ok(())
}
