import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-home',
  imports: [RouterLink, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <section class="hero forge-card">
        <h1>Welcome back</h1>
        <p>
          Your safety training hub. Work through your team's published courses in My Training, or
          sharpen your hazard instincts in the Safety Arcade below.
        </p>
      </section>

      <h2 class="arcade-title">My Training</h2>
      <div class="game-grid training-grid">
        <article class="forge-card game-card">
          <div class="game-art training" aria-hidden="true">
            <span class="game-emblem training-emblem">&#9874;</span>
          </div>
          <h3>My Training</h3>
          <p>
            Your team's published safety courses — interactive lessons, knowledge checks, and a
            progress bar that remembers exactly where you left off.
          </p>
          <p-button label="Browse courses" routerLink="/courses" />
        </article>
      </div>

      <h2 class="arcade-title">Safety Arcade</h2>
      <div class="game-grid">
        <article class="forge-card game-card">
          <div class="game-art hazard" aria-hidden="true">
            <span class="game-emblem">&#9888;</span>
          </div>
          <h3>Hazard Hunter</h3>
          <p>
            Walk the warehouse floor in first person. Spot the OSHA violations before the shift ends
            — every miss becomes an incident report.
          </p>
          <p-button label="Start your shift" routerLink="/games/hazard-hunter" />
        </article>

        <article class="forge-card game-card">
          <div class="game-art peril" aria-hidden="true">
            <span class="game-emblem">PERIL!</span>
          </div>
          <h3>PERIL!</h3>
          <p>
            The workplace-safety game show. Buzz in against other players — or our notoriously
            overconfident rookie AIs — across two rounds and a Final PERIL wager.
          </p>
          <p-button label="Take the podium" routerLink="/games/peril" />
        </article>
      </div>
    </div>
  `,
  styles: `
    .hero {
      margin-bottom: 32px;
    }

    .hero p {
      color: var(--forge-text-subtle);
      max-width: 60ch;
      margin: 0;
    }

    .arcade-title {
      margin-bottom: 16px;
    }

    .game-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 24px;
    }

    .training-grid {
      margin-bottom: 32px;
      grid-template-columns: repeat(auto-fit, minmax(320px, 480px));
    }

    .game-art.training {
      background: var(--sf-grad-ember);
    }

    .game-art.training .training-emblem {
      font-size: 44px;
      color: rgb(255 255 255 / 0.92);
      text-shadow: 0 2px 6px rgb(0 0 0 / 0.25);
    }

    .game-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition:
        transform 130ms ease-out,
        box-shadow 130ms ease-out;
    }

    .game-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--forge-shadow-elevated);
    }

    .game-card h3 {
      margin: 0;
    }

    .game-card p {
      color: var(--forge-text-subtle);
      margin: 0;
      flex: 1;
    }

    .game-art {
      height: 120px;
      border-radius: var(--forge-radius);
      display: grid;
      place-items: center;
    }

    .game-art.hazard {
      background: repeating-linear-gradient(-45deg, #f5c518 0 24px, #2c2c2c 24px 48px);
    }

    .game-art.hazard .game-emblem {
      font-size: 44px;
      background: var(--forge-surface);
      border-radius: 50%;
      width: 72px;
      height: 72px;
      display: grid;
      place-items: center;
      box-shadow: var(--forge-shadow-elevated);
    }

    .game-art.peril {
      background: linear-gradient(160deg, #060ce9, #020563);
    }

    .game-art.peril .game-emblem {
      color: #d69f4c;
      font-family: 'Haettenschweiler', 'Arial Narrow Bold', sans-serif;
      font-size: 40px;
      letter-spacing: 0.06em;
      text-shadow: 3px 3px 0 #000;
    }
  `,
})
export class Home {}
