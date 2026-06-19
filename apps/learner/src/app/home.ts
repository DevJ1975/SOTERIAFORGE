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
          Your ATL safety training hub. Work through aviation-safety courses, track your progress,
          and sharpen your hazard instincts in the Safety Arcade.
        </p>
        <div class="hero-actions">
          <p-button label="Browse courses" routerLink="/courses" />
          <p-button label="My Learning" routerLink="/my-learning" severity="secondary" />
        </div>
      </section>

      <h2 class="arcade-title">ATL Safety Arcade</h2>
      <div class="game-grid">
        <article class="forge-card game-card">
          <div class="game-art hazard" aria-hidden="true">
            <span class="game-emblem">&#9888;</span>
          </div>
          <h3>Hazard Hunter — ATL Ramp</h3>
          <p>
            Walk the ATL ramp in first person. Spot the OSHA and ramp-safety violations before the
            push-back window closes — every miss becomes an incident report.
          </p>
          <p-button
            label="Start your shift"
            routerLink="/games/hazard-hunter"
            [queryParams]="{ level: 3 }"
          />
        </article>

        <article class="forge-card game-card">
          <div class="game-art peril" aria-hidden="true">
            <span class="game-emblem">PERIL!</span>
          </div>
          <h3>PERIL! — Aviation Safety</h3>
          <p>
            The workplace-safety game show, airport edition. Buzz in across two rounds of aviation
            safety categories and a Final PERIL wager.
          </p>
          <p-button
            label="Take the podium"
            routerLink="/games/peril"
            [queryParams]="{ board: 'airport' }"
          />
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

    .hero-actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
      flex-wrap: wrap;
    }

    .arcade-title {
      margin-bottom: 16px;
    }

    .game-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 24px;
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
