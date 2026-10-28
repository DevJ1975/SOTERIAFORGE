# Open Badges 3.0 — verifiable credentials

Assurance issues badges as **Open Badges 3.0 / 1EdTech Verifiable Credentials** —
portable, employer-verifiable — not vanity images.

## Data model

- Badge **definitions**: a per-tenant `Badge` (name, description, icon, kind, rule and
  target), authored by staff through `/api/badges`. Credentials are always manual.
- Badge **awards** (earned credentials): issued server-side and recorded on the
  learner (e.g. an awards table plus a signed assertion document).

## Issuance flow (server-authoritative)

1. A completion event (course/module completion, quiz pass) references
   `badgeRefs` on the course/module.
2. The API verifies the learner genuinely earned it (same anti-cheat
   path as XP — never client-asserted) and **mints an OB 3.0 assertion**: a
   `VerifiableCredential` / `OpenBadgeCredential` JSON-LD with `issuer`,
   `credentialSubject` (the recipient), `achievement` (the badge), and `proof`.
3. The assertion is **signed** with the issuer's key and stored; the learner can
   export/verify it anywhere that understands OB 3.0.

## The signing step (deployment-time)

Minting a _verifiable_ credential requires an **issuer key pair** (Ed25519 /
`eddsa-rdfc-2022`) whose public key is published at a stable issuer DID/URL, with
the private key held in a Railway secret variable. This needs live infrastructure (key,
hosted issuer profile, optional status list for revocation), so it is designed
here and wired at deployment rather than stubbed with a throwaway key.

Until the key is provisioned, Assurance records badge **awards** (which badge, to
whom, for what, when) so no earned-credential data is lost; the signed,
exportable VC is generated once the issuer key is configured.

## Status

- ✅ Badge definitions + authoring in Django (`gamification.Badge`; admin Badges page)
- ✅ Award recording: automatic rules evaluated inside the lesson-completion
  transaction, instructor sign-off for credentials (`gamification.BadgeAward`, audited)
- ⏳ VC signing + hosted issuer profile — deployment-time (issuer key as a Railway
  secret)
