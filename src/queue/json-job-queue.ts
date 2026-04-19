import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { env } from "../config/env.js";
import type { JobStateFile, RenderProvider, VideoJob } from "../models/video-job.js";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";
import { logger } from "../utils/logger.js";

const EMPTY_STATE: JobStateFile = { jobs: [] };

export class JsonJobQueue {
  private readonly queueFilePath: string;
  private readonly sqlitePath: string;
  private readonly sqliteEnabled: boolean;
  private writeChain: Promise<void> = Promise.resolve();
  private db?: Database.Database;

  constructor(queueFilePath = env.QUEUE_FILE) {
    this.queueFilePath = queueFilePath;
    this.sqlitePath = env.SQLITE_DB_PATH;
    this.sqliteEnabled = env.USE_SQLITE;
    if (this.sqliteEnabled) {
      this.db = new Database(this.sqlitePath);
      this.db
        .prepare(
          "CREATE TABLE IF NOT EXISTS jobs (video_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, payload TEXT NOT NULL)",
        )
        .run();
    }
  }

  async listJobs(): Promise<VideoJob[]> {
    const state = await this.readState();
    return [...state.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getById(videoId: string): Promise<VideoJob | undefined> {
    const state = await this.readState();
    return state.jobs.find((job) => job.videoId === videoId);
  }

  async findByTopicId(topicId: string): Promise<VideoJob | undefined> {
    const state = await this.readState();
    return state.jobs.find((job) => job.topicId === topicId);
  }

  async createFromTopicId(topicId: string, topicTitle: string): Promise<VideoJob> {
    return this.createFromTopic(topicId, topicTitle, env.DEFAULT_RENDER_PROVIDER);
  }

  async createFromTopic(topicId: string, topicTitle: string, renderProvider: RenderProvider): Promise<VideoJob> {
    const now = new Date().toISOString();
    const job: VideoJob = {
      videoId: randomUUID(),
      topicId,
      topicTitle,
      status: "draft",
      approvals: {
        topicApproved: true,
        scriptApproved: false,
        finalRenderApproved: false,
      },
      researchBrief: undefined,
      script: undefined,
      scenes: [],
      renderProvider,
      assets: {},
      createdAt: now,
      updatedAt: now,
    };

    await this.withWriteLock(async () => {
      const state = await this.readState();
      state.jobs.push(job);
      await this.writeState(state);
    });
    logger.info("Created video job from topic", { videoId: job.videoId, topicId, topicTitle });
    return job;
  }

  async updateJob(videoId: string, patch: Partial<VideoJob>): Promise<VideoJob> {
    return this.withWriteLock(async () => {
      const state = await this.readState();
      const index = state.jobs.findIndex((job) => job.videoId === videoId);
      if (index < 0) {
        throw new Error(`Video job not found: ${videoId}`);
      }
      const current = state.jobs[index];
      const next: VideoJob = {
        ...current,
        ...patch,
        approvals: {
          ...current.approvals,
          ...(patch.approvals ?? {}),
        },
        assets: {
          ...current.assets,
          ...(patch.assets ?? {}),
        },
        updatedAt: new Date().toISOString(),
      };
      state.jobs[index] = next;
      await this.writeState(state);
      return next;
    });
  }

  private async withWriteLock<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.writeChain;
    let release: () => void = () => {};
    this.writeChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  private async readState(): Promise<JobStateFile> {
    if (this.db) {
      const rows = this.db
        .prepare("SELECT payload FROM jobs ORDER BY datetime(updated_at) DESC")
        .all() as Array<{ payload: string }>;
      return { jobs: rows.map((row) => JSON.parse(row.payload) as VideoJob) };
    }
    return readJsonFile<JobStateFile>(this.queueFilePath, EMPTY_STATE);
  }

  private async writeState(state: JobStateFile): Promise<void> {
    if (this.db) {
      const tx = this.db.transaction((jobs: VideoJob[]) => {
        this.db?.prepare("DELETE FROM jobs").run();
        const insert = this.db?.prepare(
          "INSERT INTO jobs (video_id, updated_at, payload) VALUES (@videoId, @updatedAt, @payload)",
        );
        for (const job of jobs) {
          insert?.run({
            videoId: job.videoId,
            updatedAt: job.updatedAt,
            payload: JSON.stringify(job),
          });
        }
      });
      tx(state.jobs);
      return;
    }
    await writeJsonFile(this.queueFilePath, state);
  }
}
