# AI YouTube Operator

Production-ready TypeScript app for running an AI-assisted YouTube channel with:

- Modular services:
  - `topic_queue`
  - `research_brief`
  - `script_generator`
  - `voiceover_generator`
  - `scene_planner`
  - `video_job_runner`
  - `upload_manager`
  - `approval_dashboard`
- Env-driven connectors:
  - ElevenLabs TTS
  - Runway video API
  - Google Veo video API
  - YouTube Data API upload (OAuth 2.0 local consent + resumable uploads)
- Local JSON queue/state storage
- Enforced status progression:
  - `draft -> awaiting_approval -> approved_for_render`
- Strict anti-slop QA gate with `qa_report.json` outputs
- Approval web dashboard for:
  - approving a topic
  - approving a script
  - approving the final render
- Retry logic + structured logging for external API calls
- Project outputs grouped by `video_id` under `/projects/{video_id}/...`

## Architecture

### Core modules

1. **topic_queue**
   - Stores and manages candidate topics in `data/topics.json`.
   - Statuses: `pending | approved | rejected`.
   - Service: `src/services/topic-queue-service.ts`

2. **research_brief**
   - Creates structured research briefs from approved topics.
   - Service: `src/services/research-brief-service.ts`

3. **script_generator**
   - Produces structured script drafts from research briefs.
   - Service: `src/services/script-generator-service.ts`

4. **voiceover_generator**
   - Generates narration content via ElevenLabs connector (or mock fallback).
   - Service: `src/services/voiceover-generator-service.ts`

5. **scene_planner**
   - Converts one script into **12-20** structured scenes with provider routing metadata.
   - Scene schema includes:
     - `scene_id`
     - `duration_target`
     - `visual_goal`
     - `shot_type`
     - `motion_type`
     - `generator_provider`
     - `prompt`
     - `fallback_prompt`
   - Service: `src/services/scene-planner-service.ts`

6. **video_job_runner**
   - Orchestrates the full pipeline with strict status transitions.
   - Service: `src/services/video-job-runner-service.ts`

9. **anti_slop_qa**
   - Deterministic script QA gate that enforces anti-slop standards.
   - Rejects scripts that feel like headline summaries or generic intros.
   - Requires opinion, business example, surprising detail, counterpoint, and closing takeaway.
   - Enforces narrator style constraints.
   - Service: `src/services/anti-slop-qa-service.ts`

7. **upload_manager**
   - Uploads rendered output via YouTube OAuth connector.
   - Service: `src/services/upload-manager-service.ts`

10. **youtube_uploader**
   - OAuth 2.0 browser-based one-time consent flow.
   - Reads OAuth credentials from `client_secrets.json`.
   - Requests **only** `https://www.googleapis.com/auth/youtube.upload`.
   - Uses resumable upload with retry logic.
   - Module: `src/connectors/youtube-uploader.ts`

8. **approval_dashboard**
   - Browser dashboard for human-in-the-loop approvals.
   - Files:
     - `src/web/approval-dashboard-routes.ts`
     - `src/web/template.ts`

### Status flow

Every video job follows this required status progression:

`draft -> awaiting_approval -> approved_for_render`

- `draft`: job initialized from approved topic.
- `awaiting_approval`: research/script/QA/audio/scenes prepared, waiting approvals.
- `approved_for_render`: script and final render approved, ready to render+upload.

## Channel identity and style contract

Channel identity:
- Documentary-style breakdowns of broken business systems and how AI would redesign them.

Narrator:
- Male or female voice, fixed forever once chosen.
- Sounds like an operator, not a presenter.
- Slightly dry, intelligent, skeptical.
- Never sounds excited for no reason.

### Banned language

The following phrases are hard-banned:
- `In today's video`
- `Welcome back`
- `game-changer`
- `revolutionary`
- `let's dive in`
- `smash the like button`
- `AI is taking over`

### Required script structure

Every script must follow this shape:
1. Hook with a hard claim
2. Explain the failing system
3. Show the hidden mechanism
4. Rebuild it with AI
5. End with the lesson

### Visual style guardrails

- Dark neutral UI
- Cinematic but restrained
- Diagrams, overlays, mock dashboards, maps, short generated inserts
- No endless stock footage
- No random flashy transitions

### Quality bar

- Every video must contain one memorable line
- Every scene must visually teach something
- Every script must feel like it has a point of view

## Project structure

```text
src/
  app.ts
  index.ts
  config/env.ts
  connectors/
  models/
  queue/
  services/
  storage/
  utils/
  web/
data/
projects/
logs/
```

## Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

Copy and edit:

```bash
cp .env.example .env
```

Fill API keys as needed:

- `ELEVENLABS_API_KEY`
- `RUNWAY_API_KEY`
- `GOOGLE_VEO_API_KEY`
- `YOUTUBE_API_KEY` (optional, not required by OAuth uploader)

For OAuth upload flow, place `client_secrets.json` at repo root (or set `YOUTUBE_CLIENT_SECRETS_FILE`).

If keys are missing, connectors fall back to deterministic mock behavior so local development still works.

### 3) Run in development

```bash
npm run dev
```

Dashboard:

```text
http://localhost:3000/dashboard
```

### 4) Build for production

```bash
npm run build
npm start
```

## Dashboard usage flow

1. Open dashboard.
2. Create a topic.
3. Click **Approve topic**.
   - Creates a video job in `draft`.
   - Initial pipeline run moves it to `awaiting_approval`.
4. Click **Approve script**.
5. Click **Approve final render**.
   - Moves status to `approved_for_render`.
6. Click **Run render + upload**.
   - Calls Runway or Veo based on job provider.
   - Uploads result via OAuth uploader.

## Output storage by `video_id`

For each job, artifacts are stored in:

- `/projects/{video_id}/script`
- `/projects/{video_id}/audio`
- `/projects/{video_id}/scenes`
- `/projects/{video_id}/renders`
- `/projects/{video_id}/upload`

Typical files:

- `script/research-brief.json`
- `script/script.json`
- `script/qa_report.json`
- `audio/voiceover.txt`
- `scenes/scene-plan.json`
- `renders/render.json`
- `renders/provider-jobs.json`
- `upload/upload.json`
- `upload/result.json`

## Video provider implementation

### Provider A: Runway
`RunwayService` implements:
- `createVideoJob(prompt, imageRefs?, videoRefs?)`
- `getVideoJob(jobId)`
- `downloadVideo(jobId)`

### Provider B: Google Veo (Gemini flow)
`VeoService` implements:
- `submitGeneration(prompt)` for long-running generation
- `getVideoJob(jobId)` for operation status checks
- `pollUntilDone(jobId)` until operation completes
- `downloadVideo(jobId)` to retrieve output video URI

### Provider fallback logic

The runner selects provider per scene:
- **Runway** for standard scenes
- **Veo** for hero shots or scenes where `premium=true`

If a global provider override is passed, that override takes precedence for all scenes.

### Provider response IDs for retries

Per-scene provider jobs are persisted on the job and to artifact storage so retries can reuse IDs:
- `VideoJob.sceneProviderJobs`
- `/projects/{video_id}/renders/provider-jobs.json`

## YouTube uploader module

The uploader supports:
- title
- description
- tags
- categoryId
- privacyStatus
- scheduled publish timestamp (`publishAt`)

Behavior:
- First uploads default to `private`.
- OAuth 2.0 local browser consent flow (one-time; tokens cached).
- Scope requested: `youtube.upload` only.
- Resumable uploads with retry logic.

Upload result file written to:
- `/projects/{video_id}/upload/result.json`

Result shape includes:
- `youtube_video_id`
- `upload_time`
- `final_title`
- `final_description`
- `thumbnail_status`

## Anti-slop QA rules

The draft stage now includes a strict QA layer that blocks progression if script quality is weak.

### Hard rejections
- Reject scripts that sound like headline summarization / recap content.
- Reject intros beginning with:
  - `In today's video`
  - `Welcome back`
  - `AI is changing everything`

### Required content signals
Each script must include:
- one strong opinion
- one concrete business example
- one surprising detail
- one counterpoint
- one closing takeaway

### Narrator style constraints
- sharp, slightly cynical, competent operator tone
- short to medium sentences
- no hype words
- no emoji
- no robotic transitions

### QA output artifact
- A machine-readable report is written to:
  - `/projects/{video_id}/script/qa_report.json`
- Contains:
  - `passed` boolean
  - per-rule check results
  - failure reasons

If QA fails, the job remains in `draft` and includes failure reasons in `lastError`.

## API endpoints

- `GET /health`
- `POST /api/topic`
- `GET /api/jobs`
- `POST /api/jobs/run/:videoId`
- `GET /dashboard`

## Reliability and logging

- All external API calls route through:
  - `withRetry` utility (`src/utils/retry.ts`)
  - structured logger (`src/utils/logger.ts`)
  - centralized HTTP client (`src/connectors/http-client.ts`)
- Logs are emitted to console and `logs/app.log`.

## Notes for production hardening

- Replace simulated connector fallback behavior with strict failure mode if required.
- Add background worker / scheduler for polling async render jobs.
- Add auth to dashboard routes.
- Add persistent DB (SQLite/Postgres) if you need multi-process coordination.
