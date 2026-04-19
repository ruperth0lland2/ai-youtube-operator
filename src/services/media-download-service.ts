import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { AppError } from "../utils/app-error.js";
import { ErrorCategory } from "../models/error-category.js";
import { ensureDirectory } from "../utils/fs.js";
import { ProjectStorage } from "../storage/project-storage.js";

export class MediaDownloadService {
  constructor(private readonly storage: ProjectStorage) {}

  async downloadToFile(url: string, destinationPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new AppError(
        ErrorCategory.PROVIDER_ERROR,
        `Failed to download media from ${url}. HTTP status ${response.status}`,
      );
    }

    try {
      await pipeline(response.body, createWriteStream(destinationPath));
    } catch (error) {
      await unlink(destinationPath).catch(() => undefined);
      throw new AppError(
        ErrorCategory.PROVIDER_ERROR,
        `Failed to stream media from ${url} to ${destinationPath}`,
        { cause: error },
      );
    }
  }

  async downloadSceneVideo(videoId: string, sceneId: string, outputUri: string): Promise<string> {
    const localPath = this.storage.resolve(videoId, "renders", `${sceneId}.mp4`);
    await ensureDirectory(path.dirname(localPath));
    await this.downloadToFile(outputUri, localPath);
    return localPath;
  }
}
