# Local course tutor

The Angular tutor and admin Knowledge Base now call Django's `apps.coach`, not
the legacy Firebase `askTutor` / `ingestKnowledge` functions. Firebase still
verifies identity. The local pilot uses native macOS Ollama and Postgres
pgvector; no model training, cloud inference, or Railway configuration is
performed.

## Local setup

Run Ollama natively on the inference Mac, listening only on `127.0.0.1:11434`.
Do not expose that port publicly. Install the two models:

```sh
ollama pull qwen3:8b
ollama pull qwen3-embedding:0.6b
```

The tested model manifests are pinned in
[`settings.py`](../backend/forge/settings.py):

| Model                  | Quantization | Manifest SHA-256                                                   |
| ---------------------- | ------------ | ------------------------------------------------------------------ |
| `qwen3:8b`             | Q4_K_M       | `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41` |
| `qwen3-embedding:0.6b` | Q8_0         | `ac6da0dfba84a81fdbfbaf330198c33cd77c4cdfc53e8bc50eb581914a15621d` |

A missing model or changed digest produces an explicit 503. Do not silently
substitute another model. A deliberate model change requires evaluation and,
for embeddings, reingestion of every source.

The local Compose Postgres image already includes pgvector. From `backend/`:

```sh
uv sync
DB_USE_OWNER=1 uv run --env-file .env python manage.py migrate --noinput
DB_USE_OWNER=1 uv run --env-file .env python manage.py ensure_app_role
```

Set `COACH_ENABLED=true` in the ignored local `backend/.env`; it defaults to
false elsewhere. Start Django using the normal local command:

```sh
uv run --env-file .env python manage.py runserver
```

Configure each Angular app's existing `apiBaseUrl` to the local Forge API.
Keep `forgeApiInterceptor` enabled: it supplies Firebase identity and the
acting tenant only to that configured API. A running Railway API cannot
reach the Mac's localhost. Never enable this pilot on Railway expecting it
to connect to the Mac.

## First course

1. Sign in as a tenant instructor/admin and publish a course.
2. Open **AI Knowledge Base** in the admin app.
3. Select that course, enter a title, and paste approved learner-facing text
   or upload a UTF-8 `.txt`, `.md`, or text `.pdf` file.
4. Explicitly approve the material for learners, then choose **Add & Ingest**.
   Never upload grading keys, private student data, or instructor-only answers.
5. Enroll a learner in that course. Open its **Ask the AI Tutor** panel, or
   select the course on the standalone tutor page.
6. Ask a question supported by the source and verify the source label/page.
   Ask an unsupported question and verify abstention.

This works for any subject, not just safety. Retrieval never mixes courses,
even when the same learner is enrolled in multiple courses. Instructors can
test published courses without enrolling; learners must be enrolled.
Draft/archived courses are excluded for everyone. A role, enrollment, or
publication change affects subsequent requests; publication/enrollment is
also rechecked before a generated answer is returned.

The source table offers **Replace** (repaste/reupload the full approved
replacement) and **Delete**. An identical ID, text, label, and embedding digest
is idempotent. Replacement is atomic: failed embedding preserves the existing
approved source, while successful replacement removes the old chunks.
Deletion removes its chunks. Approval/deletion audit events contain metadata,
not course text or chat.

## API

All routes require an active Forge member. Identity and tenant are determined
server-side, not from caller-supplied user IDs.

| Route                              | Access / behavior                               |
| ---------------------------------- | ----------------------------------------------- |
| `GET /api/coach/courses`           | Published courses permitted for this member     |
| `GET /api/coach/sources`           | Staff-only source metadata in the acting tenant |
| `PUT /api/coach/sources/<uuid>`    | Staff approval and atomic create/replace        |
| `DELETE /api/coach/sources/<uuid>` | Staff removal                                   |
| `POST /api/coach/ask`              | `{ "courseId": "<uuid>", "question": "..." }`   |

Ingestion accepts JSON `{ courseId, label, text, approved: true }` or multipart
fields with `file` instead of `text`. Supply exactly one content input.
Answers have `{ answer, abstained, citations }`; citations are built from
retrieved database records and contain `sourceId`, `chunkId`, `label`,
`courseId`, and nullable one-based `page`.

Both source and chunk tables enforce tenant RLS in addition to query filters.
Exact pgvector search filters tenant, permitted course, and embedding digest
before ranking up to five chunks. There is no cross-tenant shared corpus.
The model sees only the question and retrieved passages, never identity,
enrollment records, or assessment tables.

## Bounds and limitations

- One active ingest/generation operation per database, enforced across Django
  workers using a Postgres session advisory lock. Busy operations fail with
  503 instead of creating an unbounded queue. Use direct/session-pooled
  Postgres connections, not transaction pooling, for this pilot.
- Generation: 8K context, up to 512 output tokens, non-thinking mode.
  Prompts are byte-bounded; lower-ranked passages are omitted to fit.
- Embeddings: exactly 1,024 finite dimensions; provider truncation is disabled.
- Questions: 1,000 characters and 1,500 UTF-8 bytes maximum.
- Sources: 60,000 extracted characters, 80 chunks, file size at most 2 MB,
  at most 40 PDF pages. Scanned/encrypted PDFs and remote URL fetching are
  unsupported. Original files are not retained; extracted chunks are.
- PDFs are parsed synchronously from trusted staff uploads. Before exposing
  ingestion broadly, isolate document parsing in a resource-limited worker;
  byte/page limits are not a complete defense against hostile PDF complexity.
- Provider calls have bounded socket timeouts and share a 90-second operation
  budget; no additional call starts after that budget expires. Browser calls
  time out after 120 seconds. Course/account switches and chat destruction
  abort the browser request and discard late results. A disconnected browser
  is not guaranteed to immediately interrupt server-side inference.
- Ask requests have a 10/minute per-member throttle using Django's configured
  cache. The default local-memory cache is not a distributed production limit.
- Source/citation IDs are validated; unsupported uncited output and malformed
  or truncated generations fail with 503. Valid IDs do **not** prove the answer
  is factually entailed by the source. Instructor evaluation remains required.
- Source text is treated as data in the prompt, not instructions. Prompt
  injection is not solved by a system prompt; curate and review approved
  material. Responses are rendered as plain text, never HTML.
- Chat history is scoped to the mounted chat, cleared on course/account/tenant
  changes, and not persisted by Django. There is no multi-turn memory yet.
- This tutor never awards grades, certifications, or permissions.

## OSHA-specific tutor

The same model can support an opt-in OSHA-grounded course by ingesting reviewed
learner-facing OSHA material into that course. This is retrieval grounding,
not fine-tuning, and it does not change tutors for unrelated subjects.

A production OSHA knowledge collection still needs an instructor-approved
corpus, original official source URLs, standard/section identifiers,
publication/retrieval dates, and a federal-versus-state-plan scope. The current
pilot records source title, hash, and PDF page, but does not yet model those
regulatory metadata fields or automatically fetch/update OSHA material.
No OSHA corpus has been downloaded or certified. Do not present model answers
as authoritative compliance determinations or official OSHA credentials.

## Separate AI specialists

The tutor's **Agent** selector now offers:

| Agent                                    | Focus                                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Course Tutor (`general`)                 | Existing subject-independent course help                                                                       |
| AI for the Workplace (`workplace-ai`)    | Responsible adoption, productivity, privacy, output verification, bias, accessibility, and human review        |
| AI in Cybersecurity (`cybersecurity-ai`) | Defensive AI use, secure AI systems, threat modeling, prompt injection, data protection, and incident response |

These are separate server-owned RAG profiles using the **same pinned local
model**, not separately trained model weights or autonomous tool-running
agents. They do not execute actions or connect to workplace/security systems.
The cybersecurity profile is for defensive education and explicitly authorized
synthetic labs; human validation is required for AI-assisted findings.
Prompt guidance is not a guaranteed content-safety classifier.

Sources are filtered by **tenant + permitted course + selected agent +
embedding digest before ranking**. General sources are not implicitly shared
with specialists; specialists never fall back to another profile's collection.
Existing sources migrate to `general`. The source's course and agent assignment
are immutable: create a new source ID to approve the same document separately
for another specialist/course. Changing the selected agent clears transient
chat and aborts its pending browser request.

The Knowledge Base includes **Public framework candidates — pending instructor
review** with verified official landing-page links:

- Workplace: NIST AI RMF 1.0 and NIST AI 600-1 (Generative AI Profile).
- Cybersecurity: NIST CSF 2.0, NIST AI 600-1, and CISA's _Careful Adoption of
  Agentic SI Services_ guidance.

Link metadata was checked on 2026-10-27. NIST's AI RMF page notes that version
1.0 is being revised; do not assume the landing page is a frozen edition.
CISA's current guidance uses the title “SI”; record the exact reviewed
document/version rather than silently relabeling it.

These candidates are a **reference catalog only**: no public document text has
been downloaded into the course database, embedded, approved, or used as answer
evidence. The catalog remains pending even after an instructor independently
approves a course-specific source; it is not a global approval record.

Choose **Prepare for review** to prefill the agent, title, source URL, and
suggested edition. Then choose a published course, review the official
document's applicability and permitted use, record the actual edition or
retrieval date, upload/paste the approved learner-facing material, and check
the approval box. No sources are automatically fetched. Specialist ingestion
requires an HTTPS reference URL and a nonempty reviewed edition/date.
The approval records the acting staff member, source hash, profile, URL, and
edition in the tenant audit log. Citation chips include the recorded edition
and PDF page. Until approved material exists for that profile/course, it
abstains rather than answering from ungrounded model memory.

`GET /api/coach/profiles` exposes the fixed profile catalog to authenticated
members. Ask/ingestion requests accept `agent`, defaulting to `general` for
backward compatibility; unknown agent IDs are rejected. Ingestion also accepts
`referenceUrl` and `edition`, returned in staff source metadata. Profile
selection never changes course enrollment or tenant authorization.

## Verification

```sh
cd backend
uv run pytest tests/test_coach.py --reuse-db
uv run pytest tests/test_coach_profiles.py --reuse-db
# Real native Ollama + Postgres + authenticated API; synthetic text PDF only:
COACH_SMOKE=1 uv run pytest tests/test_coach_smoke.py --reuse-db
```

The real smoke test ingests a generated text PDF, checks a page-cited answer,
and verifies abstention on a question absent from the source. It also checks
both specialist prompts with clearly labeled synthetic sources and verifies
that another agent cannot retrieve them. Firebase
verification alone is mocked; retrieval and inference are real.

Before production, evaluate an instructor-reviewed corpus (~50 questions),
tenant/course isolation, citation entailment, unsupported/adversarial questions,
and realistic answer lengths at 1/3/5/21 request load. The earlier synthetic
short-answer burst is not a classroom capacity certification. Observe macOS
memory pressure and swap under normal workload, not just model allocation.

Production needs a separate secured inference host, distributed admission/rate
limits, isolated parsing, monitoring, and a reviewed retention policy before
persisting chat. Keep inference off the LiveKit media VPS. SSE streaming,
diagram generation, ratings/review queues, OCR, transcription, regulatory
versioning, and production deployment remain future work.
