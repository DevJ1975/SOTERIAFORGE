import { ChangeDetectionStrategy, Component } from '@angular/core';

interface PostureRow {
  /** The capability or control being described. */
  control: string;
  /** Honest status grounded in the codebase / readiness docs. */
  status: 'Implemented' | 'In progress' | 'Roadmap';
  /** Short, concrete evidence or context for the status. */
  detail: string;
}

/**
 * Public, customer-facing Trust & Security page for the Soteria FORGE
 * storefront. Written for an enterprise security reviewer (the ATL airport
 * authority's due-diligence team). Every claim is grounded in what actually
 * exists in the repository (firestore.rules, libs/auth, libs/data-access,
 * apps/functions, CI) and in docs/compliance/. Compliance posture is stated
 * truthfully: SOC 2 readiness is in progress; there is NO independent
 * attestation, certification, or audit report.
 */
@Component({
  selector: 'app-trust',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page trust">
      <!-- Hero -->
      <header class="hero forge-card" aria-labelledby="trust-title">
        <p class="eyebrow">Trust &amp; Security</p>
        <h1 id="trust-title">Security you can verify, stated honestly</h1>
        <p class="lede">
          Soteria FORGE is a multi-tenant learning platform built security-first: deny-by-default
          authorization, hard tenant isolation, and privilege changes that only ever happen
          server-side. This page describes the controls that exist in our codebase today and is
          candid about what is still in progress.
        </p>
        <p class="status-banner" role="status">
          <span class="status-dot" aria-hidden="true"></span>
          <span
            ><strong>SOC&nbsp;2 &mdash; in progress (readiness, not yet attested).</strong>
            Independent attestation has not been completed. No SOC&nbsp;2 Type&nbsp;I or
            Type&nbsp;II report exists.</span
          >
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" [href]="securityContactHref">Request the security package</a>
          <a class="btn btn-ghost" href="#compliance">Review compliance posture</a>
        </div>
      </header>

      <!-- Security architecture -->
      <section class="block" aria-labelledby="arch-title">
        <h2 id="arch-title">Security architecture</h2>
        <p class="block-intro">
          Authorization is enforced on the server, not in the browser. Client-side guards are a
          convenience; the Firestore security rules and Cloud Functions are the boundary that
          actually decides access.
        </p>
        <ul class="cards" role="list">
          <li class="card">
            <h3>Multi-tenant isolation</h3>
            <p>
              Every tenant's data is partitioned by a <code>tenantId</code> custom claim. Firestore
              rules are <strong>deny-by-default</strong>: a catch-all denies every path that is not
              explicitly opened, and each tenant collection is gated by
              <code>request.auth.token.tenantId</code>, so cross-tenant reads are rejected. Writes
              additionally carry an anti-spoofing guard requiring the embedded tenant id to match.
            </p>
          </li>
          <li class="card">
            <h3>Managed identity (GCIP)</h3>
            <p>
              Authentication uses Google Cloud Identity Platform multi-tenant sign-in. Tenancy is
              resolved from the request host (subdomain), and the resulting identity claims are
              parsed through a strict schema before the app trusts them.
            </p>
          </li>
          <li class="card">
            <h3>Server-only privilege</h3>
            <p>
              Roles, tenant assignment, and entitlements (<code>role</code>, <code>tenantId</code>,
              <code>entitlements</code>) are written <strong>only</strong> by Cloud Functions.
              Clients can never grant or modify their own privileges; rules deny client writes to
              member records outright, and least-privilege logic prevents a tenant admin from ever
              granting platform-superadmin.
            </p>
          </li>
          <li class="card">
            <h3>Schema-validated data access</h3>
            <p>
              All Firestore reads and writes pass through typed converters that validate against Zod
              schemas, and privileged function inputs are validated before any action is taken.
              Malformed or unexpected data is rejected at the boundary.
            </p>
          </li>
          <li class="card">
            <h3>Encryption in transit</h3>
            <p>
              All client traffic is served over TLS/HTTPS, terminated by Google-managed endpoints
              (Firebase Hosting and the Google front end).
            </p>
          </li>
          <li class="card">
            <h3>Encryption at rest</h3>
            <p>
              Stored data is encrypted at rest using Google Cloud / Firestore default encryption, a
              platform-managed control we rely on as a subservice.
            </p>
          </li>
        </ul>
      </section>

      <!-- Engineering controls -->
      <section class="block" aria-labelledby="eng-title">
        <h2 id="eng-title">Engineering &amp; change controls</h2>
        <ul class="cards two-up" role="list">
          <li class="card">
            <h3>PR-gated CI</h3>
            <p>
              Every change flows through a pull request gated by continuous integration: formatting,
              linting, unit tests, and builds must pass before merge. Reproducible installs use a
              pinned lockfile.
            </p>
          </li>
          <li class="card">
            <h3>Security-rules tests</h3>
            <p>
              Firestore security rules ship with emulator-backed unit tests that prove tenant
              isolation (including denial of cross-tenant reads). By policy, rules and their tests
              land in the <strong>same pull request</strong> as any new collection.
            </p>
          </li>
          <li class="card">
            <h3>Least-privilege boundaries</h3>
            <p>
              Module boundaries are enforced in the build (an app may depend on shared UI, data, and
              feature libraries but not reach across improperly), giving defense-in-depth against
              accidental coupling. Role management is scoped to the least privilege needed.
            </p>
          </li>
          <li class="card">
            <h3>Dependency &amp; secret scanning</h3>
            <p>
              Automated dependency-vulnerability and secret scanning in CI are
              <strong>in progress</strong>. Today we rely on lockfile pinning and clean installs;
              adding SCA and a secret scanner to the pipeline is a tracked remediation item.
            </p>
          </li>
        </ul>
      </section>

      <!-- Compliance posture -->
      <section class="block" id="compliance" aria-labelledby="comp-title">
        <h2 id="comp-title">Compliance posture</h2>
        <div class="callout" role="note">
          <h3>SOC&nbsp;2 &mdash; in progress (readiness, not yet attested)</h3>
          <p>
            Soteria FORGE is actively pursuing SOC&nbsp;2 and maintains a code-grounded readiness
            assessment, but is
            <strong>not currently SOC&nbsp;2 certified, audited, or attested</strong>. There is no
            SOC&nbsp;2 Type&nbsp;I or Type&nbsp;II report, no independent auditor engagement, and no
            audit period in progress. We will not display a certification badge or cite an audit
            firm or audit date until a real attestation exists.
          </p>
        </div>

        <h3 class="sub">Trust Services Criteria we are working toward</h3>
        <p class="block-intro">
          Our readiness work maps the platform to the AICPA Trust Services Criteria, focused on the
          Security / Common Criteria, plus Availability and Confidentiality:
        </p>
        <ul class="tsc" role="list">
          <li>
            <strong>CC1&ndash;CC5</strong> &mdash; control environment, communication, risk
            assessment, monitoring, and control activities
          </li>
          <li>
            <strong>CC6</strong> &mdash; logical access: identity, authorization, tenant isolation
            <span class="tag tag-strong">strongest today</span>
          </li>
          <li>
            <strong>CC7</strong> &mdash; system operations: logging, monitoring, incident response
          </li>
          <li><strong>CC8</strong> &mdash; change management (PR + CI pipeline)</li>
          <li><strong>CC9</strong> &mdash; risk mitigation and third-party / vendor management</li>
          <li>
            <strong>Availability</strong> &amp; <strong>Confidentiality</strong> &mdash; backups/DR
            and encryption with tenant-scoped access
          </li>
        </ul>

        <h3 class="sub">Control status at a glance</h3>
        <p class="block-intro">
          An honest snapshot. &ldquo;Implemented&rdquo; means a control mechanism exists in our
          codebase today &mdash; it is not the same as an auditor attesting that it operates
          effectively over time.
        </p>
        <div class="table-wrap" role="region" aria-label="Control status table" tabindex="0">
          <table class="posture">
            <caption class="visually-hidden">
              Control posture: implemented, in progress, and roadmap items
            </caption>
            <thead>
              <tr>
                <th scope="col">Control</th>
                <th scope="col">Status</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              @for (row of postureRows; track row.control) {
                <tr>
                  <th scope="row">{{ row.control }}</th>
                  <td>
                    <span
                      class="badge"
                      [class.badge-impl]="row.status === 'Implemented'"
                      [class.badge-progress]="row.status === 'In progress'"
                      [class.badge-roadmap]="row.status === 'Roadmap'"
                      >{{ row.status }}</span
                    >
                  </td>
                  <td>{{ row.detail }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="fine">
          A more detailed, code-cited SOC&nbsp;2 readiness assessment and controls matrix are
          maintained internally and are available, under NDA, as part of our security due-diligence
          package.
        </p>
      </section>

      <!-- Data handling & privacy -->
      <section class="block" aria-labelledby="data-title">
        <h2 id="data-title">Data handling &amp; privacy</h2>
        <ul class="cards two-up" role="list">
          <li class="card">
            <h3>Tenant data segregation</h3>
            <p>
              Customer data is segregated per tenant. Data-access helpers are path-scoped by tenant
              and security rules forbid cross-tenant reads, so one customer's data is never
              reachable from another tenant's session.
            </p>
          </li>
          <li class="card">
            <h3>Data classification &amp; retention</h3>
            <p>
              Classification is currently implicit in our schema and rules (public catalog data is
              world-readable; all tenant data is access-gated). A formal data classification and
              retention policy is <strong>in progress</strong> and not yet ratified.
            </p>
          </li>
          <li class="card">
            <h3>Subprocessor transparency</h3>
            <p>
              We are transparent about the subprocessors we rely on:
              <strong>Google Cloud / Firebase</strong> (hosting, identity, database, server
              functions) and <strong>Stripe</strong> (B2C payment processing). Card data is handled
              by Stripe; the application stores only references, never raw card details.
            </p>
          </li>
          <li class="card">
            <h3>Reviewing subprocessor attestations</h3>
            <p>
              Maintaining a formal vendor register and reviewing our subprocessors' own SOC&nbsp;2
              reports (Google Cloud, Stripe) is <strong>in progress</strong> as part of our
              third-party risk program.
            </p>
          </li>
        </ul>
      </section>

      <!-- Contact -->
      <section class="block contact-block" aria-labelledby="contact-title">
        <div class="forge-card contact-card">
          <h2 id="contact-title">Security due diligence</h2>
          <p>
            Enterprise security reviewers can request our security and due-diligence package &mdash;
            including the detailed SOC&nbsp;2 readiness assessment, controls matrix, and
            architecture notes &mdash; or report a vulnerability.
          </p>
          <a class="btn btn-primary" [href]="securityContactHref">Contact the security team</a>
        </div>
      </section>

      <!-- Disclaimer footer -->
      <footer class="disclaimer" role="contentinfo">
        <p>
          <strong>Informational only &mdash; not an attestation.</strong> This page describes the
          current engineering state of Soteria FORGE and is provided for security due diligence. It
          is not a SOC&nbsp;2 report and does not constitute certification, attestation, or a
          warranty. Soteria FORGE is not SOC&nbsp;2 certified, audited, or attested; statements
          about controls describe design present in the codebase, not independently tested operating
          effectiveness. Content is point-in-time and subject to change.
        </p>
      </footer>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .trust {
      display: flex;
      flex-direction: column;
      gap: 36px;
      padding-bottom: 48px;
    }

    /* Hero */
    .hero {
      background: var(--forge-surface);
    }

    .eyebrow {
      font-family: var(--forge-font);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 0.72rem;
      color: var(--forge-accent);
      margin: 0 0 8px;
    }

    .hero h1 {
      max-width: 22ch;
    }

    .lede {
      max-width: 70ch;
      color: var(--forge-text-subtle);
      font-size: 1.02rem;
    }

    .status-banner {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 18px 0 0;
      padding: 12px 16px;
      border: 1px solid var(--forge-border);
      border-left: 4px solid var(--forge-notice);
      border-radius: var(--forge-radius-small);
      background: var(--forge-surface-dim);
      max-width: 78ch;
    }

    .status-banner strong {
      color: var(--forge-text);
    }

    .status-banner span:last-child {
      color: var(--forge-text-subtle);
    }

    .status-dot {
      width: 10px;
      height: 10px;
      margin-top: 5px;
      border-radius: 50%;
      background: var(--forge-notice);
      flex: 0 0 auto;
    }

    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 20px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      font-family: var(--forge-font);
      font-weight: 600;
      font-size: 0.92rem;
      letter-spacing: 0.02em;
      padding: 9px 18px;
      border-radius: 16px;
      border: 1px solid transparent;
      cursor: pointer;
      text-decoration: none;
      transition:
        background 130ms ease-out,
        color 130ms ease-out,
        border-color 130ms ease-out;
    }

    .btn-primary {
      background: var(--forge-accent);
      color: #fff;
    }

    .btn-primary:hover {
      background: var(--forge-accent-hover);
      color: #fff;
      text-decoration: none;
    }

    .btn-ghost {
      background: transparent;
      color: var(--forge-accent);
      border-color: var(--forge-border);
    }

    .btn-ghost:hover {
      background: var(--forge-surface-dim);
      text-decoration: none;
    }

    /* Section blocks */
    .block-intro {
      max-width: 74ch;
      color: var(--forge-text-subtle);
    }

    .block h2 {
      border-bottom: 2px solid var(--forge-border);
      padding-bottom: 8px;
    }

    /* Card grids */
    .cards {
      list-style: none;
      margin: 16px 0 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }

    .cards.two-up {
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    }

    .card {
      background: var(--forge-surface);
      border: 1px solid var(--forge-border);
      border-radius: var(--forge-radius);
      padding: 18px 20px;
      box-shadow: var(--forge-shadow-emphasized);
    }

    .card h3 {
      margin-bottom: 6px;
    }

    .card p {
      margin: 0;
      color: var(--forge-text-subtle);
      font-size: 0.95rem;
    }

    code {
      font-family: ui-monospace, 'SFMono-Regular', 'Menlo', monospace;
      font-size: 0.86em;
      background: var(--forge-surface-dim);
      border: 1px solid var(--forge-border);
      border-radius: var(--forge-radius-small);
      padding: 0 4px;
      color: var(--forge-text);
    }

    /* Compliance callout */
    .callout {
      margin-top: 14px;
      padding: 18px 22px;
      border: 1px solid var(--forge-border);
      border-left: 4px solid var(--forge-accent);
      border-radius: var(--forge-radius);
      background: var(--forge-surface);
      box-shadow: var(--forge-shadow-emphasized);
    }

    .callout h3 {
      color: var(--forge-accent);
      margin-bottom: 8px;
    }

    .callout p {
      margin: 0;
      max-width: 80ch;
      color: var(--forge-text-subtle);
    }

    h3.sub {
      margin-top: 28px;
    }

    .tsc {
      margin: 4px 0 0;
      padding-left: 20px;
      max-width: 80ch;
      color: var(--forge-text-subtle);
    }

    .tsc li {
      margin: 6px 0;
    }

    .tsc strong {
      color: var(--forge-text);
    }

    .tag {
      display: inline-block;
      margin-left: 6px;
      font-family: var(--forge-font);
      font-weight: 700;
      font-size: 0.66rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 1px 8px;
      border-radius: 10px;
      vertical-align: middle;
    }

    .tag-strong {
      background: var(--forge-surface-dim);
      color: var(--forge-positive);
      border: 1px solid var(--forge-border);
    }

    /* Status table */
    .table-wrap {
      margin-top: 14px;
      overflow-x: auto;
      border: 1px solid var(--forge-border);
      border-radius: var(--forge-radius);
    }

    .posture {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
      background: var(--forge-surface);
    }

    .posture caption {
      text-align: left;
    }

    .posture th,
    .posture td {
      text-align: left;
      padding: 11px 14px;
      border-bottom: 1px solid var(--forge-border);
      vertical-align: top;
    }

    .posture thead th {
      font-family: var(--forge-font);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 0.72rem;
      color: var(--forge-text-subtle);
      background: var(--forge-surface-dim);
    }

    .posture tbody th {
      font-weight: 600;
      color: var(--forge-text);
      white-space: nowrap;
    }

    .posture td {
      color: var(--forge-text-subtle);
    }

    .posture tbody tr:last-child th,
    .posture tbody tr:last-child td {
      border-bottom: none;
    }

    .badge {
      display: inline-block;
      font-family: var(--forge-font);
      font-weight: 700;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 9px;
      border-radius: 11px;
      border: 1px solid var(--forge-border);
      white-space: nowrap;
    }

    .badge-impl {
      color: var(--forge-positive);
    }

    .badge-progress {
      color: var(--forge-notice);
    }

    .badge-roadmap {
      color: var(--forge-text-subtle);
    }

    .fine {
      margin-top: 12px;
      max-width: 80ch;
      font-size: 0.88rem;
      color: var(--forge-text-subtle);
    }

    /* Contact */
    .contact-card {
      background: var(--forge-surface);
    }

    .contact-card p {
      max-width: 72ch;
      color: var(--forge-text-subtle);
      margin-bottom: 16px;
    }

    /* Disclaimer */
    .disclaimer {
      border-top: 1px solid var(--forge-border);
      padding-top: 18px;
    }

    .disclaimer p {
      max-width: 92ch;
      font-size: 0.82rem;
      line-height: 1.55;
      color: var(--forge-text-subtle);
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      border: 0;
    }
  `,
})
export class Trust {
  /** mailto contact for the security / due-diligence package. */
  protected readonly securityContactHref =
    'mailto:security@soteriaforge.com?subject=Security%20due-diligence%20package%20request';

  /**
   * Honest control posture, grounded in firestore.rules, libs/auth,
   * libs/data-access, apps/functions, CI, and docs/compliance/. Roadmap items
   * are clearly marked as roadmap; nothing claims attestation.
   */
  protected readonly postureRows: PostureRow[] = [
    {
      control: 'Tenant isolation (deny-by-default rules)',
      status: 'Implemented',
      detail:
        'Firestore rules gate every tenant collection on the tenantId claim, with a catch-all deny and an anti-spoofing write guard. Proven by emulator-backed rules tests.',
    },
    {
      control: 'Server-only privilege / custom claims',
      status: 'Implemented',
      detail:
        'Roles, tenant, and entitlements are written exclusively by Cloud Functions; clients cannot modify claims.',
    },
    {
      control: 'Schema-validated data access',
      status: 'Implemented',
      detail: 'All Firestore I/O and privileged function inputs are validated against Zod schemas.',
    },
    {
      control: 'Encryption in transit (TLS) and at rest',
      status: 'Implemented',
      detail:
        'TLS via Google-managed endpoints; encryption at rest is Google Cloud default (relied on as a subservice control).',
    },
    {
      control: 'PR-gated CI (lint / test / build) and rules tests',
      status: 'Implemented',
      detail:
        'Every change passes format, lint, unit tests, and build; security-rules tests run on the emulator in CI.',
    },
    {
      control: 'Dependency & secret scanning in CI',
      status: 'In progress',
      detail:
        'Lockfile pinning and clean installs today; automated SCA and secret scanning are a tracked remediation item.',
    },
    {
      control: 'Multi-factor authentication (MFA) enforcement',
      status: 'In progress',
      detail: 'GCIP supports MFA; an enforced MFA policy is not yet configured.',
    },
    {
      control: 'Data classification & retention policy',
      status: 'In progress',
      detail:
        'Classification is implicit in schema/rules today; a formal, ratified policy is being prepared.',
    },
    {
      control: 'Vendor management & subprocessor SOC review',
      status: 'In progress',
      detail:
        'Building a vendor register and a process to review Google Cloud and Stripe attestations.',
    },
    {
      control: 'Audit logging of security-relevant events',
      status: 'Roadmap',
      detail:
        'Immutable audit logging of role grants, provisioning, and deactivations is planned (Phase 8).',
    },
    {
      control: 'Monitoring & alerting',
      status: 'Roadmap',
      detail:
        'Centralized logging, error reporting, and alerting are planned for the hardening phase.',
    },
    {
      control: 'Firebase App Check',
      status: 'Roadmap',
      detail: 'Client attestation via App Check is planned (Phase 8); not yet wired into the apps.',
    },
    {
      control: 'Backups / Point-in-Time Recovery & DR',
      status: 'Roadmap',
      detail:
        'No production project is provisioned yet; Firestore backups/PITR and tested DR are planned (Phase 8).',
    },
  ];
}
