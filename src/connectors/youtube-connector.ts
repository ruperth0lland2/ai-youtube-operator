import type { UploadVideoOptions } from "./youtube-uploader.js";
import { YouTubeUploader } from "./youtube-uploader.js";

export interface YouTubeUploadInput {
  videoId: string;
  title: string;
  description: string;
  renderPath: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: "private" | "public" | "unlisted";
  scheduledPublishAt?: string;
}

export interface YouTubeUploadResult {
  youtubeVideoId: string;
  uploadTime: string;
  finalTitle: string;
  finalDescription: string;
  thumbnailStatus: "pending" | "missing" | "uploaded" | "unknown";
  videoUrl: string;
  privacyStatus: "private" | "public" | "unlisted";
  scheduledPublishAt?: string;
}

export class YouTubeConnector {
  private readonly uploader: YouTubeUploader;

  constructor(uploader?: YouTubeUploader) {
    this.uploader = uploader ?? new YouTubeUploader();
  }

  async uploadVideo(input: YouTubeUploadInput): Promise<YouTubeUploadResult> {
    const options: UploadVideoOptions = {
      filePath: input.renderPath,
      title: input.title,
      description: input.description,
      tags: input.tags,
      categoryId: input.categoryId,
      privacyStatus: input.privacyStatus,
      scheduledPublishAt: input.scheduledPublishAt,
    };
    return this.uploader.uploadVideo(options);
  }
}
