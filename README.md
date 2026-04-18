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
  - YouTube Data API upload
- Local JSON queue/state storage
- Enforced status progression:
  - `draft -> awaiting_approval -> approved_for_render`
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
   - Converts script text into scene prompts and scene timing.
   - Service: `src/services/scene-planner-service.ts`

6. **video_job_runner**
   - Orchestrates the full pipeline with strict status transitions.
   - Service: `src/services/video-job-runner-service.ts`

7. **upload_manager**
   - Uploads rendered output via YouTube connector (or mock fallback).
   - Service: `src/services/upload-manager-service.ts`

8. **approval_dashboard**
   - Browser dashboard for human-in-the-loop approvals.
   - Files:
     - `src/web/approval-dashboard-routes.ts`
     - `src/web/template.ts`

### Status flow

Every video job follows this required status progression:

`draft -> awaiting_approval -> approved_for_render`

- `draft`: job initialized from approved topic.
- `awaiting_approval`: research/script/voiceover/scenes prepared, waiting approvals.
- `approved_for_render`: script and final render approved, ready to render+upload.

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
- `YOUTUBE_API_KEY` (plus optional OAuth fields)

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
   - Uploads result to YouTube connector.

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
- `audio/voiceover.txt`
- `scenes/scene-plan.json`
- `renders/render.json`
- `upload/upload.json`

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
