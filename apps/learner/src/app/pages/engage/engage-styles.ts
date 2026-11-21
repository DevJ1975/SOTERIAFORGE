/**
 * Controls shared by the Engage session components: the dark surface from the design
 * kit (`--sf-dark-*`, gold timers), 44 px targets and a visible focus ring.
 */
export const ENGAGE_CONTROLS = `
  :host {
    display: block;
    color: var(--sf-dark-text);
  }
  h3 {
    margin: 0;
    color: #fff;
    font-size: var(--sf-text-md, 1rem);
    font-weight: var(--sf-weight-bold, 700);
  }
  .eg-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .eg-sub {
    margin: 0;
    color: var(--sf-dark-text);
    font-size: var(--sf-text-sm, 0.875rem);
  }
  .eg-gold {
    color: var(--sf-gold);
    font-weight: var(--sf-weight-black, 800);
    font-variant-numeric: tabular-nums;
  }
  .eg-btn {
    min-height: 44px;
    padding: 0 16px;
    border-radius: var(--sf-radius-md, 12px);
    border: 1px solid var(--sf-dark-line);
    background: var(--sf-dark-inset);
    color: #fff;
    font: inherit;
    font-weight: var(--sf-weight-semibold, 600);
    cursor: pointer;
  }
  .eg-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .eg-btn--primary {
    background: var(--sf-ember);
    border-color: var(--sf-ember);
  }
  .eg-btn--danger {
    background: var(--sf-danger);
    border-color: var(--sf-danger);
  }
  .eg-btn[aria-pressed='true'] {
    border-color: var(--sf-success);
    box-shadow: inset 0 0 0 1px var(--sf-success);
  }
  .eg-field {
    display: grid;
    gap: 4px;
    font-size: var(--sf-text-sm, 0.875rem);
  }
  .eg-input {
    min-height: 44px;
    padding: 8px 12px;
    border-radius: var(--sf-radius-md, 12px);
    border: 1px solid var(--sf-dark-line);
    background: var(--sf-dark-inset);
    color: #fff;
    font: inherit;
  }
  :is(.eg-btn, .eg-input, input, select, textarea):focus-visible {
    outline: 3px solid rgba(220, 72, 27, 0.75);
    outline-offset: 2px;
  }
  .eg-alert {
    margin: 0 0 12px;
    padding: 10px 12px;
    border-left: 4px solid var(--sf-danger);
    border-radius: 6px;
    background: var(--sf-dark-inset);
    color: #fff;
  }
`;
