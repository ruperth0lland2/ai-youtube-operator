import express from "express";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { env } from "./config/env.js";
import { HttpClient } from "./connectors/http-client.js";
import { AnthropicConnector } from "./connectors/anthropic-connector.js";
import { ElevenLabsConnector } from "./connectors/elevenlabs-connector.js";
import { RunwayService } from "./connectors/runway-connector.js";
import { VeoService } from "./connectors/veo-connector.js";
import { YouTubeConnector } from "./connectors/youtube-connector.js";
import { YouTubeUploader } from "./connectors/youtube-uploader.js";
import { ErrorCategory } from "./models/error-category.js";
import { JsonJobQueue } from "./queue/json-job-queue.js";
import { ResearchBriefService } from "./services/research-brief-service.js";
import { ScenePlannerService } from "./services/scene-planner-service.js";
import { ScriptGeneratorService } from "./services/script-generator-service.js";
import { TopicQueueService } from "./services/topic-queue-service.js";
import { UploadManagerService } from "./services/upload-manager-service.js";
import { VideoJobRunnerService } from "./services/video-job-runner-service.js";
import { VideoAssemblyService } from "./services/video-assembly-service.js";
import { VoiceoverGeneratorService } from "./services/voiceover-generator-service.js";
import { AntiSlopQaService } from "./services/anti-slop-qa-service.js";
import { ChannelIdentityService } from "./services/channel-identity-service.js";
import { MediaDownloadService } from "./services/media-download-service.js";
import { ProviderPollingWorker } from "./services/provider-polling-worker.js";
import { ProjectStorage } from "./storage/project-storage.js";
import { AppError } from "./utils/app-error.js";
import { logger } from "./utils/logger.js";
import { createApprovalDashboardRouter } from "./web/approval-dashboard-routes.js";

function startupProviderChecks(): void {
  if (!env.PRODUCTION_MODE) {
    return;
  }
  const required: Array<[string | undefined, string]> = [
    [env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"],
    [env.ELEVENLABS_API_KEY, "ELEVENLABS_API_KEY"],
    [env.RUNWAY_API_KEY, "RUNWAY_API_KEY"],
    [env.GOOGLE_VEO_API_KEY, "GOOGLE_VEO_API_KEY"],
  ];
  for (const [value, label] of required) {
    if (!value) {
      throw new AppError(ErrorCategory.AUTH_ERROR, `Missing required env: ${label}`);
    }
  }
  if (!existsSync(env.YOUTUBE_CLIENT_SECRETS_FILE)) {
    throw new AppError(
      ErrorCategory.AUTH_ERROR,
      `YOUTUBE_CLIENT_SECRETS_FILE missing: ${env.YOUTUBE_CLIENT_SECRETS_FILE}`,
    );
  }
}

async function validateYouTubeSecretsFile(): Promise<void> {
  if (!existsSync(env.YOUTUBE_CLIENT_SECRETS_FILE)) {
    if (env.PRODUCTION_MODE) {
      throw new AppError(
        ErrorCategory.AUTH_ERROR,
        `YOUTUBE_CLIENT_SECRETS_FILE missing: ${env.YOUTUBE_CLIENT_SECRETS_FILE}`,
      );
    }
    return;
  }

  try {
    const raw = await fs.readFile(env.YOUTUBE_CLIENT_SECRETS_FILE, "utf-8");
    JSON.parse(raw);
  } catch (error) {
    throw new AppError(
      ErrorCategory.AUTH_ERROR,
      `YOUTUBE_CLIENT_SECRETS_FILE is not valid JSON: ${env.YOUTUBE_CLIENT_SECRETS_FILE}`,
      { cause: String(error) },
    );
  }
}

function providerHealth(): Record<string, "ok" | "missing"> {
  return {
    anthropic: env.ANTHROPIC_API_KEY ? "ok" : "missing",
    elevenlabs: env.ELEVENLABS_API_KEY ? "ok" : "missing",
    runway: env.RUNWAY_API_KEY ? "ok" : "missing",
    veo: env.GOOGLE_VEO_API_KEY ? "ok" : "missing",
    youtubeClientSecrets: existsSync(env.YOUTUBE_CLIENT_SECRETS_FILE) ? "ok" : "missing",
  };
}

export function createApp(): { app: express.Express; poller: ProviderPollingWorker } {
  startupProviderChecks();
  void validateYouTubeSecretsFile().catch((error) => {
    logger.error("startup validation warning", { error: String(error) });
  });

  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  const queue = new JsonJobQueue();
  const topicQueue = new TopicQueueService(env.TOPICS_FILE);
  const storage = new ProjectStorage();

  const httpClient = new HttpClient();
  const anthropic = new AnthropicConnector();
  const elevenLabs = new ElevenLabsConnector(httpClient);
  const runway = new RunwayService(httpClient);
  const veo = new VeoService(httpClient);
  const youtube = new YouTubeConnector(new YouTubeUploader());
  const mediaDownload = new MediaDownloadService(storage);
  const assembler = new VideoAssemblyService(storage);

  const researchBrief = new ResearchBriefService(anthropic);
  const channelIdentity = new ChannelIdentityService();
  const scriptGenerator = new ScriptGeneratorService(anthropic);
  const antiSlopQa = new AntiSlopQaService();
  const voiceover = new VoiceoverGeneratorService(elevenLabs);
  const scenePlanner = new ScenePlannerService(anthropic);
  const uploadManager = new UploadManagerService(youtube, storage);
  const runner = new VideoJobRunnerService(
    queue,
    storage,
    topicQueue,
    researchBrief,
    scriptGenerator,
    antiSlopQa,
    channelIdentity,
    voiceover,
    scenePlanner,
    runway,
    veo,
    mediaDownload,
    assembler,
    uploadManager,
  );
  const pollingWorker = new ProviderPollingWorker(queue, runner, env.POLLING_INTERVAL_MS);

  app.use("/dashboard", createApprovalDashboardRouter(topicQueue, queue, runner));
  app.get("/", (_req, res) => res.redirect("/dashboard"));
  app.get("/health", (_req, res) => {
    const providers = providerHealth();
    const ok = !env.PRODUCTION_MODE || Object.values(providers).every((value) => value === "ok");
    res.json({ ok, productionMode: env.PRODUCTION_MODE, providers });
  });

  app.post("/pilot", async (_req, res) => {
    try {
      const topic = await topicQueue.addTopic(
        "Why plumbing businesses lose leads after 5pm",
        "Pilot seed to validate lead-response workflows after-hours and redesign with AI.",
      );
      const job = await runner.approveTopic(topic.id);
      await runner.prepareDraft(job.videoId);
      res.status(201).json({ topicId: topic.id, videoId: job.videoId });
    } catch (error) {
      logger.error("pilot failed", { error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/topic", async (req, res) => {
    const { title, description } = req.body as { title?: string; description?: string };
    if (!title || !description) {
      res.status(400).json({ error: "title and description are required" });
      return;
    }
    const topic = await topicQueue.addTopic(title, description);
    res.status(201).json(topic);
  });

  app.get("/api/jobs", async (_req, res) => {
    const jobs = await queue.listJobs();
    res.json({ jobs });
  });

  app.post("/api/jobs/run/:videoId", async (req, res) => {
    try {
      const job = await runner.run(req.params.videoId);
      res.json(job);
    } catch (error) {
      logger.error("manual run failed", { videoId: req.params.videoId, error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  return { app, poller: pollingWorker };
}
