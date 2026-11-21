import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ENGAGE_CONTROLS } from './engage-styles';
import { type Heatmap, percent } from './engage-session.model';

type Cell = Heatmap['crews'][number]['cells'][number];

/**
 * Debrief: how each crew did on each activity. A real table (so it reads row by row),
 * with every cell showing its number; the tint only repeats what the number says.
 */
@Component({
  selector: 'assurance-session-heatmap',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-pane' },
  template: `
    <div class="eg-head">
      <h3 id="hm-h">Debrief heat map</h3>
      <span class="eg-sub">Crews only. No individual answers are shown.</span>
    </div>
    @if (heatmap().activities.length === 0 || heatmap().crews.length === 0) {
      <p class="eg-sub">No activities have been run in this session yet.</p>
    } @else {
      <div class="scroll" tabindex="0" role="region" aria-labelledby="hm-h">
        <table>
          <caption class="sf-visually-hidden">
            Share of each crew that answered correctly (Threat Hunt) or took part (poll)
          </caption>
          <thead>
            <tr>
              <th scope="col">Crew</th>
              @for (activity of heatmap().activities; track activity.id; let i = $index) {
                <th scope="col">
                  <span class="kind"
                    >{{ activity.kind === 'hunt' ? 'Hunt' : 'Poll' }} {{ i + 1 }}</span
                  >
                  <span class="prompt">{{ activity.prompt }}</span>
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (crew of heatmap().crews; track crew.crewId) {
              <tr>
                <th scope="row">{{ crew.name }}</th>
                @for (activity of heatmap().activities; track activity.id) {
                  @let cell = cellFor(crew.cells, activity.id);
                  <td [style.background]="tint(cell)">
                    @if (cell) {
                      <span class="pct">{{ rate(cell) }}</span>
                      <span class="count">{{ count(cell, activity.kind) }}</span>
                    } @else {
                      <span class="count">No data</span>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    ENGAGE_CONTROLS,
    `
      .scroll {
        overflow-x: auto;
      }
      .scroll:focus-visible {
        outline: 3px solid rgba(220, 72, 27, 0.75);
        outline-offset: 2px;
      }
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 4px;
      }
      th,
      td {
        padding: 8px 10px;
        border-radius: 8px;
        text-align: left;
        vertical-align: top;
        font-size: var(--sf-text-sm, 0.875rem);
      }
      th {
        color: #fff;
        font-weight: var(--sf-weight-semibold, 600);
      }
      td {
        min-width: 6.5rem;
        border: 1px solid var(--sf-dark-line);
      }
      .kind,
      .pct {
        display: block;
        color: #fff;
        font-weight: var(--sf-weight-bold, 700);
      }
      .prompt,
      .count {
        display: block;
        font-size: var(--sf-text-xs, 0.75rem);
        font-weight: var(--sf-weight-regular, 400);
      }
      .prompt {
        max-width: 14rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
  ],
})
export class SessionHeatmapComponent {
  readonly heatmap = input.required<Heatmap>();

  protected cellFor(cells: Cell[], activityId: string): Cell | undefined {
    return cells.find((cell) => cell.activityId === activityId);
  }

  protected rate(cell: Cell): string {
    return cell.rate === null ? 'No answers' : `${Math.round(cell.rate * 100)}%`;
  }

  protected count(cell: Cell, kind: 'poll' | 'hunt'): string {
    return kind === 'hunt' && cell.correct !== null
      ? `${cell.correct} of ${cell.members} correct`
      : `${cell.responded} of ${cell.members} answered`;
  }

  /** Stronger green for a higher share; the number in the cell says the same thing. */
  protected tint(cell: Cell | undefined): string {
    if (!cell || cell.rate === null) return 'transparent';
    const strength = percent(Math.round(cell.rate * 100), 100) / 100;
    return `rgba(31, 138, 91, ${(0.12 + strength * 0.5).toFixed(2)})`;
  }
}
