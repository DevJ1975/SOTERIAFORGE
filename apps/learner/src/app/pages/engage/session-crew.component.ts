import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ENGAGE_CONTROLS } from './engage-styles';
import type { CrewMemberScore, SessionCrew } from './engage-session.model';

const nf = new Intl.NumberFormat('en-US');

/** My crew in this session: who is on it, each member's points and the crew's standing. */
@Component({
  selector: 'assurance-session-crew',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-pane' },
  template: `
    <div class="eg-head">
      <h3 id="crew-h">{{ crew().name }}</h3>
      <span class="rank">#{{ crew().rank }} of {{ crew().crewCount }} crews</span>
    </div>
    <ul aria-labelledby="crew-h">
      @for (member of crew().members; track member.memberId) {
        <li>
          <span class="who"
            >{{ member.name }}<span class="eg-sub">{{ marks(member) }}</span></span
          >
          <span class="eg-gold">{{ fmt(member.points) }}</span>
        </li>
      }
    </ul>
    <p class="total">
      <span class="eg-sub">Crew total</span>
      <span class="eg-gold total__n">{{ fmt(crew().total) }}</span>
    </p>
    <p class="eg-sub note">Only your crew sees these points. The class sees crew totals.</p>
  `,
  styles: [
    ENGAGE_CONTROLS,
    `
      .rank {
        padding: 4px 10px;
        border-radius: 6px;
        background: var(--sf-dark-inset);
        color: var(--sf-gold);
        font-size: var(--sf-text-xs, 0.75rem);
        font-weight: var(--sf-weight-bold, 700);
      }
      ul {
        display: grid;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      li,
      .total {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }
      .who {
        color: #fff;
      }
      .total {
        margin: 14px 0 0;
        padding-top: 12px;
        border-top: 1px solid var(--sf-dark-line);
      }
      .total__n {
        font-size: 1.4rem;
      }
      .note {
        margin-top: 8px;
        font-size: var(--sf-text-xs, 0.75rem);
      }
    `,
  ],
})
export class SessionCrewComponent {
  readonly crew = input.required<SessionCrew>();

  /** " · lead · you", as far as each applies. */
  protected marks(member: CrewMemberScore): string {
    return (member.isLead ? ' · lead' : '') + (member.isMe ? ' · you' : '');
  }

  protected fmt(n: number): string {
    return nf.format(n);
  }
}
