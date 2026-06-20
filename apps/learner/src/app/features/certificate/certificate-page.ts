import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { getDoc } from 'firebase/firestore';
import { ButtonModule } from 'primeng/button';
import { PrincipalStore } from '@forge/auth';
import { courseDoc, enrollmentDoc, FIRESTORE, memberDoc, tenantDoc } from '@forge/data-access';
import { ForgeMark } from '@forge/ui';
import type { Course, Enrollment, Member, Tenant } from '@forge/shared';

/**
 * Certificate of Completion — a print-styled, single-page certificate the
 * learner can save to PDF via the browser's print dialog (no extra dependency).
 *
 * Data mirrors `features/my-learning`: the principal's identity comes from
 * {@link PrincipalStore}; the completed enrollment, the course (for its title),
 * the member (for a stable display name) and the tenant (the issuer) are read
 * via the `@forge/data-access` collection helpers. The certificate only renders
 * when the enrollment is actually `completed`; otherwise a friendly
 * "not available yet" state is shown so a partial/missing record never crashes.
 */
@Component({
  selector: 'app-certificate-page',
  imports: [RouterLink, ButtonModule, ForgeMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cert-ground">
      @if (loading()) {
        <p class="muted" role="status">Preparing your certificate…</p>
      } @else if (!ready()) {
        <section class="cert-fallback" aria-labelledby="cert-fallback-title">
          <h1 id="cert-fallback-title">Certificate not available yet</h1>
          <p class="muted">
            @if (error()) {
              We couldn't load this certificate. Please try again.
            } @else if (!course()) {
              We couldn't find this course.
            } @else {
              Finish <strong>{{ courseTitle() }}</strong> to unlock its Certificate of Completion.
            }
          </p>
          <div class="fallback-actions no-print">
            @if (error()) {
              <p-button label="Retry" icon="pi pi-refresh" (onClick)="retry()" />
            }
            <p-button label="Back to My Learning" severity="secondary" routerLink="/my-learning" />
          </div>
        </section>
      } @else {
        <div class="cert-toolbar no-print">
          <a routerLink="/my-learning" class="back-link">&larr; My Learning</a>
          <p-button label="Download / Print" icon="pi pi-print" (onClick)="print()" />
        </div>

        <article class="certificate" aria-labelledby="cert-title">
          <header class="cert-head">
            <forge-mark [size]="72" variant="charcoal" />
          </header>

          <p class="cert-eyebrow">Soteria Forge</p>
          <h1 id="cert-title" class="cert-title">Certificate of Completion</h1>

          <div class="cert-rule" aria-hidden="true"></div>

          <p class="cert-presented">This certifies that</p>
          <p class="cert-name">{{ displayName() }}</p>
          <p class="cert-body">has successfully completed</p>
          <p class="cert-course">{{ courseTitle() }}</p>

          <div class="cert-meta">
            <div class="meta-block">
              <span class="meta-label">Date of completion</span>
              <span class="meta-value">{{ completionDateLabel() }}</span>
            </div>
            <div class="cert-seal" aria-hidden="true">
              <span class="seal-emblem pi pi-verified"></span>
            </div>
            <div class="meta-block meta-right">
              <span class="meta-label">Issued by</span>
              <span class="meta-value">{{ issuerName() }}</span>
            </div>
          </div>
        </article>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .muted {
      color: var(--forge-text-subtle);
    }
    .cert-ground {
      background: var(--sf-cast, #f6f1e9);
      border-radius: var(--forge-radius-card, 18px);
      padding: 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }
    .cert-toolbar {
      width: 100%;
      max-width: 960px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .back-link {
      color: var(--forge-accent);
      text-decoration: none;
      font-size: 0.9rem;
    }
    .cert-fallback {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 24px;
    }
    .fallback-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;
    }

    /* The certificate card itself — warm cream ground, charcoal ink, ember rule. */
    .certificate {
      width: 100%;
      max-width: 960px;
      background: var(--sf-cast, #f6f1e9);
      color: var(--sf-charcoal, #1b1e23);
      border: 1px solid var(--sf-hairline, #dddcde);
      border-radius: var(--forge-radius-card, 18px);
      box-shadow: var(--forge-shadow-elevated);
      padding: 56px clamp(32px, 6vw, 88px);
      text-align: center;
      position: relative;
    }
    .cert-head {
      display: flex;
      justify-content: center;
      margin-bottom: 12px;
    }
    .cert-eyebrow {
      margin: 0;
      font-family: var(--forge-font, 'Barlow Semi Condensed', sans-serif);
      text-transform: uppercase;
      letter-spacing: 0.32em;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--sf-muted, #8a929c);
    }
    .cert-title {
      margin: 8px 0 0;
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      line-height: 1.05;
      font-size: clamp(1.9rem, 4.5vw, 3rem);
      color: var(--sf-charcoal, #1b1e23);
    }
    .cert-rule {
      width: 140px;
      height: 4px;
      margin: 20px auto 28px;
      border-radius: 999px;
      background: var(--sf-grad-ember, linear-gradient(150deg, #f69a3c, #d8451a));
    }
    .cert-presented,
    .cert-body {
      margin: 0;
      color: var(--sf-steel, #3a4048);
      font-size: 1rem;
    }
    .cert-name {
      margin: 10px 0 22px;
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-weight: 700;
      font-size: clamp(1.6rem, 3.6vw, 2.4rem);
      color: var(--sf-charcoal, #1b1e23);
    }
    .cert-course {
      margin: 10px 0 0;
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-weight: 600;
      font-size: clamp(1.25rem, 2.8vw, 1.8rem);
      color: var(--sf-ember, #e8551f);
    }
    .cert-meta {
      margin-top: 48px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 24px;
    }
    .meta-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
      text-align: left;
    }
    .meta-right {
      text-align: right;
      align-items: flex-end;
    }
    .meta-label {
      font-family: var(--forge-font, 'Barlow Semi Condensed', sans-serif);
      text-transform: uppercase;
      letter-spacing: 0.16em;
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--sf-muted, #8a929c);
    }
    .meta-value {
      font-weight: 600;
      color: var(--sf-charcoal, #1b1e23);
    }
    .cert-seal {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--sf-grad-ember, linear-gradient(150deg, #f69a3c, #d8451a));
      box-shadow:
        0 0 0 4px var(--sf-cast, #f6f1e9),
        0 0 0 5px var(--sf-hairline, #dddcde);
    }
    .seal-emblem {
      font-size: 30px;
      color: #fff;
    }
    @media (max-width: 560px) {
      .cert-meta {
        grid-template-columns: 1fr;
        justify-items: center;
        gap: 16px;
      }
      .meta-block,
      .meta-right {
        text-align: center;
        align-items: center;
      }
    }

    /*
     * Print: hide the app chrome (shell, toolbar, buttons) and lay the
     * certificate out as a clean, borderless landscape A4 page with no shadows.
     */
    @media print {
      .no-print {
        display: none !important;
      }
      .cert-ground {
        padding: 0;
        background: #fff;
        border-radius: 0;
      }
      .certificate {
        max-width: none;
        width: 100%;
        min-height: 100vh;
        border: none;
        border-radius: 0;
        box-shadow: none;
        display: flex;
        flex-direction: column;
        justify-content: center;
        page-break-after: avoid;
      }
    }
    @page {
      size: A4 landscape;
      margin: 12mm;
    }
  `,
})
export class CertificatePage {
  private readonly route = inject(ActivatedRoute);
  private readonly db = inject(FIRESTORE);
  private readonly principal = inject(PrincipalStore);

  private readonly courseId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('courseId') ?? '')),
    { initialValue: '' },
  );

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly course = signal<Course | undefined>(undefined);
  protected readonly enrollment = signal<Enrollment | undefined>(undefined);
  private readonly member = signal<Member | undefined>(undefined);
  private readonly tenant = signal<Tenant | undefined>(undefined);

  /** A certificate is only shown for a course that has actually been completed. */
  protected readonly ready = computed(
    () => !!this.course() && !!this.enrollment()?.completed && !this.error(),
  );

  protected readonly courseTitle = computed(() => this.course()?.title ?? 'this course');

  /** Prefer the member's stored name, then the signed-in display name, else a neutral label. */
  protected readonly displayName = computed(
    () => this.member()?.displayName || this.principal.displayName() || 'Soteria Forge learner',
  );

  /** The issuing tenant/organisation name (falls back gracefully). */
  protected readonly issuerName = computed(() => this.tenant()?.name ?? 'Soteria Forge');

  /**
   * Completion date: the enrollment has no dedicated `completedAt`, so use the
   * most recent activity timestamp, falling back to the audit `updatedAt` /
   * `createdAt`. Rendered in a stable, locale-friendly long form.
   */
  protected readonly completionDateLabel = computed(() => {
    const e = this.enrollment();
    const iso = e?.lastActivityAt ?? e?.updatedAt ?? e?.createdAt;
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  });

  private lastCourseId = '';

  constructor() {
    // Reload whenever the route param resolves/changes (component may be reused).
    effect(() => void this.maybeLoad(this.courseId()));
  }

  private async maybeLoad(id: string): Promise<void> {
    if (!id || id === this.lastCourseId) return;
    this.lastCourseId = id;
    const tenantId = this.principal.tenantId();
    const uid = this.principal.uid();
    if (!tenantId || !uid) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(false);
    this.course.set(undefined);
    this.enrollment.set(undefined);
    try {
      const [courseSnap, enrollmentSnap, memberSnap, tenantSnap] = await Promise.all([
        getDoc(courseDoc(this.db, tenantId, id)),
        getDoc(enrollmentDoc(this.db, tenantId, id, uid)),
        getDoc(memberDoc(this.db, tenantId, uid)),
        getDoc(tenantDoc(this.db, tenantId)),
      ]);
      this.course.set(courseSnap.exists() ? courseSnap.data() : undefined);
      this.enrollment.set(enrollmentSnap.exists() ? enrollmentSnap.data() : undefined);
      this.member.set(memberSnap.exists() ? memberSnap.data() : undefined);
      this.tenant.set(tenantSnap.exists() ? tenantSnap.data() : undefined);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected retry(): void {
    this.lastCourseId = '';
    void this.maybeLoad(this.courseId());
  }

  protected print(): void {
    window.print();
  }
}
