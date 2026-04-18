import type { RenderProvider, VideoJob } from "../models/video-job.js";
import { env } from "../config/env.js";
import { RunwayConnector } from "../connectors/runway-connector.js";
import { VeoConnector } from "../connectors/veo-connector.js";
import { JsonJobQueue } from "../queue/json-job-queue.js";
import { ProjectStorage } from "../storage/project-storage.js";
import { logger } from "../utils/logger.js";
import { ResearchBriefService } from "./research-brief-service.js";
import { ScenePlannerService } from "./scene-planner-service.js";
import { ScriptGeneratorService } from "./script-generator-service.js";
import { TopicQueueService } from "./topic-queue-service.js";
import { UploadManagerService } from "./upload-manager-service.js";
import { VoiceoverGeneratorService } from "./voiceover-generator-service.js";

export class VideoJobRunnerService {
  constructor(
    private readonly queue: JsonJobQueue,
    private readonly storage: ProjectStorage,
    private readonly topicQueue: TopicQueueService,
    private readonly researchBriefService: ResearchBriefService,
    private readonly scriptGeneratorService: ScriptGeneratorService,
    private readonly voiceoverGeneratorService: VoiceoverGeneratorService,
    private readonly scenePlannerService: ScenePlannerService,
    private readonly runwayConnector: RunwayConnector,
    private readonly veoConnector: VeoConnector,
    private readonly uploadManagerService: UploadManagerService,
  ) {}

  async approveTopic(topicId: string): Promise<VideoJob> {
    const topic = await this.topicQueue.approve(topicId);
    const existing = await this.queue.findByTopicId(topic.id);
    if (existing) {
      return existing;
    }
    const job = await this.queue.createFromTopic(topic.id, topic.title, env.DEFAULT_RENDER_PROVIDER);
    await this.storage.ensureProjectFolders(job.videoId);
    logger.info("topic_queue: approved and job created", { topicId: topic.id, videoId: job.videoId });
    return job;
  }

  async prepareDraft(videoId: string): Promise<VideoJob> {
    const job = await this.requireJob(videoId);
    if (job.status !== "draft") {
      return job;
    }

    const brief = this.researchBriefService.generate(job.videoId, job.topicTitle, "");
    const briefPath = await this.storage.writeScript(videoId, brief, "research-brief.json");
    const script = this.scriptGeneratorService.generate(job.videoId, brief);
    const scriptPath = await this.storage.writeScript(videoId, script, "script.json");
    const audioText = await this.voiceoverGeneratorService.generate(script);
    const audioPath = await this.storage.writeAudio(videoId, { provider: "elevenlabs", content: audioText });
    const scenePlan = this.scenePlannerService.generate(videoId, script.fullText);
    const scenesPath = await this.storage.writeScenes(videoId, scenePlan);

    return this.queue.updateJob(videoId, {
      status: "awaiting_approval",
      researchBrief: brief.summary,
      script: script.fullText,
      scenes: scenePlan.scenes,
      assets: {
        researchBriefPath: briefPath,
        scriptPath,
        audioPath,
        scenesPath,
      },
    });
  }

  async runApprovedJob(videoId: string, provider?: RenderProvider): Promise<VideoJob> {
    return this.run(videoId, provider);
  }

  async approveScript(videoId: string): Promise<VideoJob> {
    const job = await this.requireJob(videoId);
    if (job.status !== "awaiting_approval") {
      throw new Error("Script approval is only valid in awaiting_approval");
    }

    return this.queue.updateJob(videoId, {
      approvals: {
        ...job.approvals,
        scriptApproved: true,
      },
    });
  }

  async approveFinalRender(videoId: string): Promise<VideoJob> {
    const job = await this.requireJob(videoId);
    if (job.status !== "awaiting_approval") {
      throw new Error("Final render approval is only valid in awaiting_approval");
    }
    if (!job.approvals.scriptApproved) {
      throw new Error("Script must be approved before final render approval");
    }

    return this.queue.updateJob(videoId, {
      status: "approved_for_render",
      approvals: {
        ...job.approvals,
        finalRenderApproved: true,
      },
    });
  }

  async run(videoId: string, provider?: RenderProvider): Promise<VideoJob> {
    const job = await this.requireJob(videoId);
    if (job.status === "draft") {
      return this.prepareDraft(videoId);
    }
    if (job.status !== "approved_for_render") {
      return job;
    }

    const renderProvider = provider ?? job.renderProvider;
    const renderResult =
      renderProvider === "runway"
        ? await this.runwayConnector.renderVideo(videoId, job.scenes)
        : await this.veoConnector.renderVideo(videoId, job.scenes);

    const renderPath = await this.storage.writeRender(videoId, renderResult);
    const uploaded = await this.uploadManagerService.upload({
      ...job,
      renderProvider,
      assets: {
        ...job.assets,
        renderPath,
      },
    });

    return this.queue.updateJob(videoId, {
      renderProvider,
      assets: {
        ...job.assets,
        renderPath,
        uploadPath: uploaded.uploadPath,
      },
      uploadUrl: uploaded.uploadUrl,
    });
  }

  async listJobs(): Promise<VideoJob[]> {
    return this.queue.listJobs();
  }

  private async requireJob(videoId: string): Promise<VideoJob> {
    const job = await this.queue.getById(videoId);
    if (!job) {
      throw new Error(`Video job not found: ${videoId}`);
    }
    return job;
  }
}
