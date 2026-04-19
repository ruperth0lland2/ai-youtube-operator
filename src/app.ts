import express from "express";
import { env } from "./config/env.js";
import { HttpClient } from "./connectors/http-client.js";
import { ElevenLabsConnector } from "./connectors/elevenlabs-connector.js";
import { RunwayService } from "./connectors/runway-connector.js";
import { VeoService } from "./connectors/veo-connector.js";
import { YouTubeConnector } from "./connectors/youtube-connector.js";
import { YouTubeUploader } from "./connectors/youtube-uploader.js";
import { JsonJobQueue } from "./queue/json-job-queue.js";
import { ResearchBriefService } from "./services/research-brief-service.js";
import { ScenePlannerService } from "./services/scene-planner-service.js";
import { ScriptGeneratorService } from "./services/script-generator-service.js";
import { TopicQueueService } from "./services/topic-queue-service.js";
import { UploadManagerService } from "./services/upload-manager-service.js";
import { VideoJobRunnerService } from "./services/video-job-runner-service.js";
import { VoiceoverGeneratorService } from "./services/voiceover-generator-service.js";
import { AntiSlopQaService } from "./services/anti-slop-qa-service.js";
import { ChannelIdentityService } from "./services/channel-identity-service.js";
import { ProjectStorage } from "./storage/project-storage.js";
import { logger } from "./utils/logger.js";
import { createApprovalDashboardRouter } from "./web/approval-dashboard-routes.js";

export function createApp(): express.Express {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  const queue = new JsonJobQueue();
  const topicQueue = new TopicQueueService(env.TOPICS_FILE);
  const storage = new ProjectStorage();

  const httpClient = new HttpClient();
  const tts = new ElevenLabsConnector(httpClient);
  const runway = new RunwayService(httpClient);
  const veo = new VeoService(httpClient);
  const youtube = new YouTubeConnector(new YouTubeUploader());

  const researchBrief = new ResearchBriefService();
  const channelIdentity = new ChannelIdentityService();
  const scriptGenerator = new ScriptGeneratorService();
  const antiSlopQa = new AntiSlopQaService();
  const voiceover = new VoiceoverGeneratorService(tts);
  const scenePlanner = new ScenePlannerService();
  const uploadManager = new UploadManagerService(youtube, storage);
  const jobRunner = new VideoJobRunnerService(
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
    uploadManager,
  );

  app.use("/dashboard", createApprovalDashboardRouter(topicQueue, queue, jobRunner));

  app.get("/", (_req, res) => {
    res.redirect("/dashboard");
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
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
    const { videoId } = req.params;
    try {
      const job = await jobRunner.run(videoId);
      res.json(job);
    } catch (error) {
      logger.error("Manual run failed", { videoId, error: String(error) });
      res.status(500).json({ error: String(error) });
    }
  });

  return app;
}
