import type { RenderProvider, SceneProviderJobRecord, VideoJob } from "../models/video-job.js";
import { env } from "../config/env.js";
import { RunwayService } from "../connectors/runway-connector.js";
import { VeoService } from "../connectors/veo-connector.js";
import { JsonJobQueue } from "../queue/json-job-queue.js";
import { ProjectStorage } from "../storage/project-storage.js";
import { logger } from "../utils/logger.js";
import { ResearchBriefService } from "./research-brief-service.js";
import { ScenePlannerService } from "./scene-planner-service.js";
import { ScriptGeneratorService } from "./script-generator-service.js";
import { TopicQueueService } from "./topic-queue-service.js";
import { UploadManagerService } from "./upload-manager-service.js";
import { VoiceoverGeneratorService } from "./voiceover-generator-service.js";
import { AntiSlopQaService } from "./anti-slop-qa-service.js";

export class VideoJobRunnerService {
  constructor(
    private readonly queue: JsonJobQueue,
    private readonly storage: ProjectStorage,
    private readonly topicQueue: TopicQueueService,
    private readonly researchBriefService: ResearchBriefService,
    private readonly scriptGeneratorService: ScriptGeneratorService,
    private readonly antiSlopQaService: AntiSlopQaService,
    private readonly voiceoverGeneratorService: VoiceoverGeneratorService,
    private readonly scenePlannerService: ScenePlannerService,
    private readonly runwayService: RunwayService,
    private readonly veoService: VeoService,
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

    const qaReport = this.antiSlopQaService.evaluate(videoId, script.fullText);
    const qaReportPath = await this.storage.writeQaReport(videoId, qaReport);

    if (!qaReport.passed) {
      logger.warn("anti_slop_qa: script rejected", {
        videoId,
        reasons: qaReport.failures,
      });
      return this.queue.updateJob(videoId, {
        lastError: `anti_slop_qa failed: ${qaReport.failures.join("; ")}`,
        assets: {
          ...job.assets,
          researchBriefPath: briefPath,
          scriptPath,
          qaReportPath,
        },
      });
    }

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
        qaReportPath,
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

    const sceneRenderJobs = await this.renderScenes(videoId, job, provider);
    const renderManifest = {
      videoId,
      generatedAt: new Date().toISOString(),
      scenes: sceneRenderJobs,
    };
    const renderPath = await this.storage.writeRender(videoId, renderManifest);
    const uploaded = await this.uploadManagerService.upload({
      ...job,
      renderProvider: provider ?? job.renderProvider,
      assets: {
        ...job.assets,
        renderPath,
      },
    });

    return this.queue.updateJob(videoId, {
      renderProvider: provider ?? job.renderProvider,
      assets: {
        ...job.assets,
        renderPath,
        uploadPath: uploaded.uploadPath,
      },
      providerJobIds: sceneRenderJobs,
      uploadUrl: uploaded.uploadUrl,
    });
  }

  private async renderScenes(
    videoId: string,
    job: VideoJob,
    providerOverride?: RenderProvider,
  ): Promise<SceneProviderJobRecord[]> {
    const renderJobs: SceneProviderJobRecord[] = [];

    for (const scene of job.scenes) {
      const selectedProvider = providerOverride ?? scene.generator_provider;

      if (selectedProvider === "veo") {
        const submit = await this.veoService.submitGeneration(scene.prompt);
        const operation = await this.veoService.pollUntilDone(submit.operationName);
        const output = await this.veoService.downloadVideo(submit.operationName);
        renderJobs.push({
          sceneId: scene.scene_id,
          provider: "veo",
          providerJobId: submit.jobId,
          submittedAt: new Date().toISOString(),
          status: operation.metadata?.state ?? "completed",
          outputUri: output.outputUri,
        });
        continue;
      }

      const create = await this.runwayService.createVideoJob(scene.prompt);
      await this.runwayService.getVideoJob(create.jobId);
      const output = await this.runwayService.downloadVideo(create.jobId);
      renderJobs.push({
        sceneId: scene.scene_id,
        provider: "runway",
        providerJobId: create.jobId,
        submittedAt: new Date().toISOString(),
        status: "completed",
        outputUri: output.outputUri,
      });
    }

    return renderJobs;
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
