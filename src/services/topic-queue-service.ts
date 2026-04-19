import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { env } from "../config/env.js";
import type { Topic } from "../models/topic.js";
import { ensureDirectory, readJsonFile, writeJsonFile } from "../utils/fs.js";

interface TopicState {
  topics: Topic[];
}

const EMPTY_STATE: TopicState = { topics: [] };

export class TopicQueueService {
  private db?: Database.Database;

  constructor(private readonly filePath = env.TOPICS_FILE) {
    if (env.USE_SQLITE) {
      void ensureDirectory(env.SQLITE_DB_PATH.split("/").slice(0, -1).join("/") || ".");
      this.db = new Database(env.SQLITE_DB_PATH);
      this.db
        .prepare(
          `CREATE TABLE IF NOT EXISTS topics (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            approved_at TEXT
          )`,
        )
        .run();
    }
  }

  async listTopics(): Promise<Topic[]> {
    if (this.db) {
      const rows = this.db.prepare("SELECT * FROM topics ORDER BY datetime(created_at) DESC").all() as Array<{
        id: string;
        title: string;
        description: string;
        status: Topic["status"];
        created_at: string;
        approved_at: string | null;
      }>;
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        approvedAt: row.approved_at,
      }));
    }
    const state = await this.readState();
    return [...state.topics].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async addTopic(title: string, description: string): Promise<Topic> {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle || !trimmedDescription) {
      throw new Error("title and description are required");
    }
    const state = await this.readState();
    const topic: Topic = {
      id: randomUUID(),
      title: trimmedTitle,
      description: trimmedDescription,
      status: "pending",
      createdAt: new Date().toISOString(),
      approvedAt: null,
    };
    if (this.db) {
      this.db
        .prepare(
          "INSERT INTO topics (id, title, description, status, created_at, approved_at) VALUES (@id, @title, @description, @status, @createdAt, @approvedAt)",
        )
        .run(topic);
      return topic;
    }
    state.topics.push(topic);
    await writeJsonFile(this.filePath, state);
    return topic;
  }

  async approveTopic(topicId: string): Promise<Topic> {
    if (this.db) {
      const row = this.db.prepare("SELECT * FROM topics WHERE id = ?").get(topicId) as
        | {
            id: string;
            title: string;
            description: string;
            status: Topic["status"];
            created_at: string;
            approved_at: string | null;
          }
        | undefined;
      if (!row) {
        throw new Error(`Topic not found: ${topicId}`);
      }
      const approvedAt = new Date().toISOString();
      this.db.prepare("UPDATE topics SET status = 'approved', approved_at = ? WHERE id = ?").run(approvedAt, topicId);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        status: "approved",
        createdAt: row.created_at,
        approvedAt,
      };
    }
    const state = await this.readState();
    const index = state.topics.findIndex((topic) => topic.id === topicId);
    if (index < 0) {
      throw new Error(`Topic not found: ${topicId}`);
    }
    const next: Topic = {
      ...state.topics[index],
      status: "approved",
      approvedAt: new Date().toISOString(),
    };
    state.topics[index] = next;
    await writeJsonFile(this.filePath, state);
    return next;
  }

  async approve(topicId: string): Promise<Topic> {
    return this.approveTopic(topicId);
  }

  async getById(topicId: string): Promise<Topic | undefined> {
    const topics = await this.listTopics();
    return topics.find((topic) => topic.id === topicId);
  }

  private async readState(): Promise<TopicState> {
    return readJsonFile<TopicState>(this.filePath, EMPTY_STATE);
  }
}
