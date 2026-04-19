import type { RenderProvider, SceneProviderJobRecord, VideoJob, UploadResultSummary } from "../models/video-job.js";
import { env } from "../config/env.js";
import { RunwayService } from "../connectors/runway-connector.js";
import { VeoService } from "../connectors/veo-connector.js";
import { JsonJobQueue } from "../queue/json-job-queue.js";
import { ProjectStorage } from "../storage/project-storage.js";
import { logger } from "../utils/logger.js";
import { ResearchBriefService } from "./research-brief-service.js";
import type { Scene } from "../models/scene.js";
import { ScenePlannerService } from "./scene-planner-service.js";
import { ScriptGeneratorService } from "./script-generator-service.js";
import { TopicQueueService } from "./topic-queue-service.js";
import { UploadManagerService } from "./upload-manager-service.js";
import { VoiceoverGeneratorService } from "./voiceover-generator-service.js";
import { AntiSlopQaService } from "./anti-slop-qa-service.js";
import { ChannelIdentityService } from "./channel-identity-service.js";
import { MediaDownloadService } from "./media-download-service.js";
import { VideoAssemblyService } from "./video-assembly-service.js";

export class VideoJobRunnerService {
  constructor(
    private readonly queue: JsonJobQueue,
    private readonly storage: ProjectStorage,
    private readonly topicQueue: TopicQueueService,
    private readonly researchBriefService: ResearchBriefService,
    private readonly scriptGeneratorService: ScriptGeneratorService,
    private readonly antiSlopQaService: AntiSlopQaService,
    private readonly channelIdentityService: ChannelIdentityService,
    private readonly voiceoverGeneratorService: VoiceoverGeneratorService,
    private readonly scenePlannerService: ScenePlannerService,
    private readonly runwayService: RunwayService,
    private readonly veoService: VeoService,
    private readonly mediaDownloadService: MediaDownloadService,
    private readonly videoAssemblyService: VideoAssemblyService,
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

    const topic = await this.topicQueue.getById(job.topicId);
    const brief = await this.researchBriefService.generate(
      job.videoId,
      job.topicTitle,
      topic?.description ?? "",
    );
    const briefPath = await this.storage.writeScript(videoId, brief, "research-brief.json");
    const channelIdentity = this.channelIdentityService.getIdentity();
    const narratorProfile = await this.channelIdentityService.loadOrCreateNarratorProfile(videoId);
    const script = await this.scriptGeneratorService.generate(job.videoId, brief, channelIdentity);
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

    const audioPath = await this.voiceoverGeneratorService.generate(script, narratorProfile);
    const scenePlan = await this.scenePlannerService.generate(videoId, script.fullText, channelIdentity);
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
    const providerJobsPath = await this.storage.writeProviderJobs(videoId, sceneRenderJobs);
    await this.storage.writeRender(videoId, renderManifest);
    if (!job.assets.audioPath) {
      throw new Error("Audio path missing; cannot assemble final video.");
    }
    const renderPath = await this.videoAssemblyService.assemble(videoId, sceneRenderJobs, job.assets.audioPath);
    let uploadResult: UploadResultSummary | undefined;
    let uploadPath: string | undefined;
    let uploadUrl: string | undefined;
    if (env.DRY_RUN_MODE) {
      logger.info("DRY_RUN_MODE enabled; upload skipped", { videoId, renderPath });
    } else {
      const forcePrivate = await this.shouldForcePrivateUpload(videoId);
      const uploaded = await this.uploadManagerService.upload(
        {
          ...job,
          renderProvider: provider ?? job.renderProvider,
          assets: {
            ...job.assets,
            renderPath,
          },
        },
        renderPath,
        forcePrivate,
      );
      uploadResult = {
        youtubeVideoId: uploaded.youtubeVideoId,
        uploadTime: uploaded.uploadedAt,
        finalTitle: uploaded.finalTitle,
        finalDescription: uploaded.finalDescription,
        thumbnailStatus: uploaded.thumbnailStatus,
        effectivePrivacyStatus: uploaded.effectivePrivacyStatus,
      };
      uploadPath = uploaded.uploadPath;
      uploadUrl = uploaded.uploadUrl;
    }

    return this.queue.updateJob(videoId, {
      renderProvider: provider ?? job.renderProvider,
      assets: {
        ...job.assets,
        renderPath,
        providerJobsPath,
        uploadPath,
      },
      providerJobIds: sceneRenderJobs,
      uploadResult,
      uploadUrl,
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
        const localFilePath = await this.mediaDownloadService.downloadSceneVideo(
          videoId,
          scene.scene_id,
          output.outputUri,
        );
        renderJobs.push({
          sceneId: scene.scene_id,
          provider: "veo",
          providerJobId: submit.jobId,
          submittedAt: new Date().toISOString(),
          status: operation.metadata?.state ?? "completed",
          outputUri: output.outputUri,
          localFilePath,
        });
        continue;
      }

      const create = await this.runwayService.createVideoJob(scene.prompt);
      const output = await this.runwayService.downloadVideo(create.jobId);
      const localFilePath = await this.mediaDownloadService.downloadSceneVideo(
        videoId,
        scene.scene_id,
        output.outputUri,
      );
      renderJobs.push({
        sceneId: scene.scene_id,
        provider: "runway",
        providerJobId: create.jobId,
        submittedAt: new Date().toISOString(),
        status: "completed",
        outputUri: output.outputUri,
        localFilePath,
      });
    }

    return renderJobs;
  }

  async pollInFlightForJob(videoId: string): Promise<void> {
    const job = await this.requireJob(videoId);
    const updatedRecords: SceneProviderJobRecord[] = [];
    let changed = false;

    for (const record of job.providerJobIds ?? []) {
      const status = record.status.toLowerCase();
      if (status === "completed" || status === "failed") {
        updatedRecords.push(record);
        continue;
      }
      if (record.provider === "runway") {
        const runwayJob = await this.runwayService.getVideoJob(record.providerJobId);
        const nextStatus = runwayJob.status.toLowerCase();
        let localFilePath = record.localFilePath;
        if (runwayJob.outputUri && !localFilePath && nextStatus === "completed") {
          localFilePath = await this.mediaDownloadService.downloadSceneVideo(
            videoId,
            record.sceneId,
            runwayJob.outputUri,
          );
        }
        if (
          nextStatus !== record.status.toLowerCase() ||
          runwayJob.outputUri !== record.outputUri ||
          localFilePath !== record.localFilePath
        ) {
          changed = true;
        }
        updatedRecords.push({
          ...record,
          status: nextStatus,
          outputUri: runwayJob.outputUri ?? record.outputUri,
          localFilePath,
        });
        continue;
      }

      const operation = await this.veoService.getVideoJob(record.providerJobId);
      const done = operation.done;
      const nextStatus = done ? "completed" : operation.metadata?.state?.toLowerCase() ?? "processing";
      const outputUri =
        operation.response?.outputUri ?? operation.response?.videoUri ?? operation.response?.uri ?? record.outputUri;
      let localFilePath = record.localFilePath;
      if (done && outputUri && !localFilePath) {
        localFilePath = await this.mediaDownloadService.downloadSceneVideo(videoId, record.sceneId, outputUri);
      }
      if (
        nextStatus !== record.status.toLowerCase() ||
        outputUri !== record.outputUri ||
        localFilePath !== record.localFilePath
      ) {
        changed = true;
      }
      updatedRecords.push({
        ...record,
        status: nextStatus,
        outputUri,
        localFilePath,
      });
    }

    if (changed) {
      const providerJobsPath = await this.storage.writeProviderJobs(videoId, updatedRecords);
      await this.queue.updateJob(videoId, {
        providerJobIds: updatedRecords,
        assets: {
          ...job.assets,
          providerJobsPath,
        },
      });
    }
  }

  async pollInFlightJobs(): Promise<void> {
    const jobs = await this.queue.listJobs();
    for (const job of jobs) {
      const hasPending = (job.providerJobIds ?? []).some((record) => {
        const status = record.status.toLowerCase();
        return status !== "completed" && status !== "failed";
      });
      if (hasPending) {
        await this.pollInFlightForJob(job.videoId);
      }
    }
  }

  private async shouldForcePrivateUpload(videoId: string): Promise<boolean> {
    const allJobs = await this.queue.listJobs();
    const uploadedCount = allJobs.filter((job) => Boolean(job.uploadResult?.youtubeVideoId)).length;
    if (uploadedCount < 10) {
      logger.info("Publish policy forcing private upload", { videoId, uploadedCount });
      return true;
    }
    return false;
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
