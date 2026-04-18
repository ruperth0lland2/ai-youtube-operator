import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import type { Topic } from "../models/topic.js";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";

interface TopicState {
  topics: Topic[];
}

const EMPTY_STATE: TopicState = { topics: [] };

export class TopicQueueService {
  constructor(private readonly filePath = env.TOPICS_FILE) {}

  async listTopics(): Promise<Topic[]> {
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
    state.topics.push(topic);
    await writeJsonFile(this.filePath, state);
    return topic;
  }

  async approveTopic(topicId: string): Promise<Topic> {
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

  private async readState(): Promise<TopicState> {
    return readJsonFile<TopicState>(this.filePath, EMPTY_STATE);
  }
}
