import type { VideoJob } from "../models/video-job.js";
import { ProjectStorage } from "../storage/project-storage.js";
import { logger } from "../utils/logger.js";
import { YouTubeConnector } from "../connectors/youtube-connector.js";

export interface UploadManagerResult {
  provider: "youtube";
  uploadId: string;
  uploadUrl: string;
  uploadedAt: string;
  uploadPath: string;
}

export class UploadManagerService {
  constructor(private readonly youtube: YouTubeConnector, private readonly storage: ProjectStorage) {}

  async upload(videoJob: VideoJob): Promise<UploadManagerResult> {
    if (!videoJob.assets.renderPath) {
      throw new Error("Render output missing; cannot upload");
    }

    logger.info("upload_manager: uploading to YouTube", { videoId: videoJob.videoId });
    const result = await this.youtube.uploadVideo({
      videoId: videoJob.videoId,
      title: videoJob.topicTitle,
      description: videoJob.researchBrief ?? "AI-generated YouTube video",
      renderPath: videoJob.assets.renderPath,
    });

    const uploadPayload = {
      provider: "youtube",
      uploadId: result.uploadId,
      url: result.videoUrl,
      uploadedAt: new Date().toISOString(),
    };
    const uploadPath = await this.storage.writeUpload(videoJob.videoId, uploadPayload);

    return {
      provider: "youtube",
      uploadId: uploadPayload.uploadId,
      uploadUrl: uploadPayload.url,
      uploadedAt: uploadPayload.uploadedAt,
      uploadPath,
    };
  }
}
