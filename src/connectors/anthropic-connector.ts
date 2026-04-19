import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";
import { ErrorCategory } from "../models/error-category.js";

export class AnthropicConnector {
  private readonly client: Anthropic;
  private channelBibleCache?: string;

  constructor() {
    if (!env.ANTHROPIC_API_KEY) {
      throw new AppError(ErrorCategory.AUTH_ERROR, "ANTHROPIC_API_KEY is required");
    }
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async getChannelBible(): Promise<string> {
    if (this.channelBibleCache) {
      return this.channelBibleCache;
    }
    try {
      this.channelBibleCache = await fs.readFile(env.CHANNEL_BIBLE_FILE, "utf-8");
      return this.channelBibleCache;
    } catch (error) {
      throw new AppError(
        ErrorCategory.PROVIDER_ERROR,
        `Failed to read CHANNEL_BIBLE file at ${env.CHANNEL_BIBLE_FILE}`,
        { cause: error },
      );
    }
  }

  async complete(input: {
    system: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const response = await this.client.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: input.maxTokens ?? 2500,
      system: input.system,
      temperature: input.temperature ?? 0.2,
      messages: [{ role: "user", content: input.prompt }],
    });
    const text = response.content
      .filter((item): item is Anthropic.TextBlock => item.type === "text")
      .map((item) => item.text)
      .join("\n")
      .trim();
    if (!text) {
      throw new AppError(ErrorCategory.PROVIDER_ERROR, "Anthropic returned empty response");
    }
    return text;
  }

  async sendJsonPrompt(system: string, userPrompt: string): Promise<string> {
    return this.complete({
      system,
      prompt: userPrompt,
      temperature: 0.2,
      maxTokens: 2500,
    });
  }

  async generateJson(input: {
    operation: string;
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const raw = await this.complete({
      system: input.system,
      prompt: input.user,
      temperature: input.temperature ?? 0.2,
      maxTokens: input.maxTokens ?? 2500,
    });
    return raw;
  }

  async createJsonCompletion(input: {
    system: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    return this.complete(input);
  }
}
