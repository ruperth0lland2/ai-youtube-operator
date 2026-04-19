import path from "node:path";
import { env } from "../config/env.js";
import { ensureDirectory, writeJsonFile, writeTextFile } from "../utils/fs.js";

type Subdir = "script" | "audio" | "scenes" | "renders" | "upload";

export class ProjectStorage {
  constructor(private readonly baseDir: string = env.PROJECTS_DIR) {}

  getVideoRoot(videoId: string): string {
    return path.join(this.baseDir, videoId);
  }

  resolve(videoId: string, subdir: Subdir, fileName: string): string {
    return path.join(this.getVideoRoot(videoId), subdir, fileName);
  }

  async ensureProjectFolders(videoId: string): Promise<void> {
    const root = this.getVideoRoot(videoId);
    const dirs: Subdir[] = ["script", "audio", "scenes", "renders", "upload"];
    await Promise.all(dirs.map((dir) => ensureDirectory(path.join(root, dir))));
  }

  async writeScript(videoId: string, script: unknown, fileName = "script.md"): Promise<string> {
    await this.ensureProjectFolders(videoId);
    const filePath = this.resolve(videoId, "script", fileName);
    if (typeof script === "string") {
      await writeTextFile(filePath, script);
    } else {
      await writeJsonFile(filePath, script);
    }
    return filePath;
  }

  async writeQaReport(videoId: string, report: unknown, fileName = "qa_report.json"): Promise<string> {
    await this.ensureProjectFolders(videoId);
    const filePath = this.resolve(videoId, "script", fileName);
    await writeJsonFile(filePath, report);
    return filePath;
  }

  async writeAudio(videoId: string, audioContent: unknown, fileName = "voiceover.txt"): Promise<string> {
    await this.ensureProjectFolders(videoId);
    const filePath = this.resolve(videoId, "audio", fileName);
    if (typeof audioContent === "string") {
      await writeTextFile(filePath, audioContent);
    } else {
      await writeJsonFile(filePath, audioContent);
    }
    return filePath;
  }

  async writeScenes(videoId: string, scenePlan: unknown, fileName = "scene-plan.json"): Promise<string> {
    await this.ensureProjectFolders(videoId);
    const filePath = this.resolve(videoId, "scenes", fileName);
    if (typeof scenePlan === "string") {
      await writeTextFile(filePath, scenePlan);
    } else {
      await writeJsonFile(filePath, scenePlan);
    }
    return filePath;
  }

  async writeRender(videoId: string, renderManifest: unknown, fileName = "render.json"): Promise<string> {
    await this.ensureProjectFolders(videoId);
    const filePath = this.resolve(videoId, "renders", fileName);
    if (typeof renderManifest === "string") {
      await writeTextFile(filePath, renderManifest);
    } else {
      await writeJsonFile(filePath, renderManifest);
    }
    return filePath;
  }

  async writeProviderJobs(
    videoId: string,
    providerJobs: unknown,
    fileName = "provider-jobs.json",
  ): Promise<string> {
    await this.ensureProjectFolders(videoId);
    const filePath = this.resolve(videoId, "renders", fileName);
    await writeJsonFile(filePath, providerJobs);
    return filePath;
  }

  async writeUpload(videoId: string, uploadReceipt: unknown, fileName = "upload.json"): Promise<string> {
    await this.ensureProjectFolders(videoId);
    const filePath = this.resolve(videoId, "upload", fileName);
    if (typeof uploadReceipt === "string") {
      await writeTextFile(filePath, uploadReceipt);
    } else {
      await writeJsonFile(filePath, uploadReceipt);
    }
    return filePath;
  }

  async writeUploadResult(videoId: string, uploadResult: unknown): Promise<string> {
    return this.writeUpload(videoId, uploadResult, "result.json");
  }

  getRenderFilePath(videoId: string, fileName: string): string {
    return this.resolve(videoId, "renders", fileName);
  }

  getAudioFilePath(videoId: string, fileName: string): string {
    return this.resolve(videoId, "audio", fileName);
  }
}
