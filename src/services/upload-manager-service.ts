import type { VideoJob } from "../models/video-job.js";
import { ProjectStorage } from "../storage/project-storage.js";
import { logger } from "../utils/logger.js";
import { YouTubeConnector } from "../connectors/youtube-connector.js";

export interface UploadManagerResult {
  provider: "youtube";
  uploadId: string;
  youtubeVideoId: string;
  uploadUrl: string;
  uploadedAt: string;
  finalTitle: string;
  finalDescription: string;
  thumbnailStatus: "missing" | "pending" | "uploaded" | "unknown";
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
      youtube_video_id: result.youtubeVideoId,
      upload_time: result.uploadTime,
      final_title: result.finalTitle,
      final_description: result.finalDescription,
      thumbnail_status: result.thumbnailStatus,
    };
    const uploadPath = await this.storage.writeUpload(videoJob.videoId, uploadPayload, "result.json");

    return {
      provider: "youtube",
      uploadId: result.youtubeVideoId,
      youtubeVideoId: result.youtubeVideoId,
      uploadUrl: result.videoUrl,
      uploadedAt: result.uploadTime,
      finalTitle: result.finalTitle,
      finalDescription: result.finalDescription,
      thumbnailStatus: result.thumbnailStatus,
      uploadPath,
    };
  }
}
