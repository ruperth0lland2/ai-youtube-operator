import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import path from "node:path";
import type { SceneProviderJobRecord } from "../models/video-job.js";
import { ProjectStorage } from "../storage/project-storage.js";
import { AppError } from "../utils/app-error.js";
import { ErrorCategory } from "../models/error-category.js";

if (!ffmpegPath) {
  throw new AppError(ErrorCategory.ASSEMBLY_ERROR, "ffmpeg-static did not provide a binary path");
}

ffmpeg.setFfmpegPath(ffmpegPath);

export class VideoAssemblyService {
  constructor(private readonly storage: ProjectStorage) {}

  async assemble(
    videoId: string,
    sceneRecords: SceneProviderJobRecord[],
    voiceoverPath: string,
  ): Promise<string> {
    const sceneFiles = sceneRecords
      .map((record) => record.localFilePath)
      .filter((filePath): filePath is string => Boolean(filePath));

    if (sceneFiles.length === 0) {
      throw new AppError(ErrorCategory.ASSEMBLY_ERROR, "No scene files available for assembly");
    }
    const concatFile = await this.storage.writeRender(
      videoId,
      sceneFiles.map((file) => `file '${path.resolve(file).replaceAll("'", "'\\''")}'`).join("\n"),
      "concat-list.txt",
    );
    const outputFile = this.storage.resolve(videoId, "renders", "final.mp4");

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatFile)
        .inputOptions(["-f concat", "-safe 0"])
        .input(voiceoverPath)
        .outputOptions([
          "-map 0:v:0",
          "-map 1:a:0",
          "-c:v copy",
          "-c:a aac",
          "-shortest",
          "-movflags +faststart",
        ])
        .save(outputFile)
        .on("end", () => resolve())
        .on("error", (error) =>
          reject(
            new AppError(
              ErrorCategory.ASSEMBLY_ERROR,
              `FFmpeg failed assembling final video for ${videoId}: ${String(error)}`,
              { cause: error },
            ),
          ),
        );
    });

    return outputFile;
  }
}
