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

## Signing

Each award can be exported as an `OpenBadgeCredential` in the Open Badges 3.0 **JWT
proof format**: a compact JWS signed with Ed25519 (`EdDSA`). Code:
`backend/apps/gamification/credentials.py`.

- The credential is built from the award row on request. Ed25519 signatures are
  deterministic, so nothing extra is stored and the same award always gives the same
  document.
- The learner is identified only by a salted SHA-256 hash of their email (FERPA). A
  verifier who already has the email can confirm it; nobody can read it from the
  credential.
- The issuer is the tenant (`/api/credentials/issuers/<tenant>`); the key is the
  platform's, published as a JWKS.

| Endpoint                                    | Who    | Returns                                            |
| ------------------------------------------- | ------ | -------------------------------------------------- |
| `GET /api/me/badges/<badge>/credential`     | holder | `{credential, jwt, verifyUrl}` for their own award |
| `GET /api/credentials/<award>`              | public | The same, by the award's random id                 |
| `GET /credentials/<award>`                  | public | The page a person reads (`verifyUrl`), see below   |
| `POST /api/credentials/verify` `{jwt}`      | public | `{valid, reason, credential}`                      |
| `GET /api/credentials/jwks`                 | public | The public key                                     |
| `GET /api/credentials/issuers/<tenant>`     | public | Issuer profile                                     |
| `GET /api/credentials/achievements/<badge>` | public | Achievement definition                             |

`GET /api/me/badges` now includes `awardId` for earned badges.

### The verification page

`verifyUrl` is `/credentials/<award>` on the API host: a plain HTML page for the employer
a learner sends the link to (`verify_page.py`). It states that the award is on record, the
badge, the issuing organization, the date and how it was earned. It never shows the
holder's name or email; the verifier types the email they were given and the page says
whether it matches the credential's salted hash. The credential's own `id` is still the
JSON address above, so software and people each get a usable URL.

In the learner app, My Progress lists earned badges with **Copy link** (the verification
page) and **Download** (the signed credential as a `.jwt` file for a badge wallet).

### Setting it up

1. `manage.py generate_badge_key` prints a new private key (it is not saved).
2. Store it as the `BADGE_SIGNING_KEY` secret variable on the API service. On AWS it is
   the Secrets Manager secret `forge-production/badge-signing-key`, passed through
   `extra_secrets` in `infra/aws/terraform.tfvars` (done 2026-11-21).
3. Set `FORGE_PUBLIC_URL` to the API's permanent public URL. Credential ids and the
   key URL are built from it, so changing it later changes every credential.

Until the key is set, awards are still recorded and the credential endpoints answer
503, so no earned-credential data is lost.

### Limits to know

- **Key rotation isn't supported yet.** Replacing the key makes credentials signed
  with the old one fail verification. Supporting old keys means publishing more than
  one key in the JWKS.
- **No revocation list.** Awards are never edited or deleted today; `verify` reports
  a credential as invalid if its award is gone or the badge has since been changed.
- **Not yet checked against an external verifier.** The tests verify the signature
  with the published key. Run one issued credential through a public Open Badges 3.0
  validator before telling employers to rely on it.

## Status

- ✅ Badge definitions + authoring in Django (`gamification.Badge`; admin Badges page)
- ✅ Award recording: automatic rules evaluated inside the lesson-completion
  transaction, instructor sign-off for credentials (`gamification.BadgeAward`, audited)
- ✅ Signed credentials, issuer profile, public key and verify endpoint
- ✅ Public verification page; copy-link and download on the learner's My Progress
- ✅ Issuer key provisioned on AWS (not on Railway)
- ⏳ External validator check, once the API is reachable at its public URL
