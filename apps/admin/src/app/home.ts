import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonModule],
  template: `
    <div class="forge-page">
      <section class="forge-card welcome">
        <h1>FORGE Admin</h1>
        <p>
          Member management, course authoring, and publishing for your tenant — everything your
          safety program needs, in one place.
        </p>
      </section>

      <div class="tiles">
        <section class="forge-card tile studio-tile">
          <span class="tile-kicker">Course authoring</span>
          <h2>Forge <span class="ember">Studio</span></h2>
          <p>
            Build block-based courses with instant autosave, undo/redo, and a pixel-identical
            learner preview. Drag in headings, media, flashcards, and knowledge checks.
          </p>
          <p-button
            label="Open Forge Studio"
            icon="pi pi-arrow-right"
            iconPos="right"
            routerLink="/courses"
          />
        </section>

        <section class="forge-card tile">
          <span class="tile-kicker">Coming next</span>
          <h2>Members &amp; reporting</h2>
          <p>
            Invite operators, assign published courses, and track completions. Arrives in a later
            phase — see ROADMAP.md for the delivery plan.
          </p>
        </section>
      </div>
    </div>
  `,
  styles: `
    p {
      color: var(--forge-text-subtle);
      max-width: 62ch;
      line-height: 1.6;
    }

    .welcome {
      margin-bottom: 18px;
    }

    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 18px;
    }

    .tile {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }

    .tile p {
      flex: 1;
      margin-top: 0;
    }

    .tile-kicker {
      font-family: var(--forge-font-display);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: var(--forge-text-subtle);
    }

    .studio-tile {
      border-top: 3px solid var(--forge-accent);
    }

    .studio-tile .tile-kicker {
      color: var(--forge-accent);
    }

    .ember {
      color: var(--forge-accent);
    }
  `,
})
export class Home {}
