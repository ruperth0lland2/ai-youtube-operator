import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATA_DIR: z.string().default("data"),
  PROJECTS_DIR: z.string().default("projects"),
  LOGS_DIR: z.string().default("logs"),
  QUEUE_FILE: z.string().default("data/jobs.json"),
  TOPICS_FILE: z.string().default("data/topics.json"),
  DEFAULT_RENDER_PROVIDER: z.enum(["runway", "veo"]).default("runway"),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().default("EXAVITQu4vr4xnSDxMaL"),
  ELEVENLABS_BASE_URL: z.string().default("https://api.elevenlabs.io/v1"),
  RUNWAY_API_KEY: z.string().optional(),
  RUNWAY_BASE_URL: z.string().default("https://api.runwayml.com/v1"),
  GOOGLE_VEO_API_KEY: z.string().optional(),
  GOOGLE_VEO_BASE_URL: z.string().default("https://generativelanguage.googleapis.com/v1beta"),
  YOUTUBE_API_KEY: z.string().optional(),
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN: z.string().optional(),
  YOUTUBE_BASE_URL: z.string().default("https://www.googleapis.com/upload/youtube/v3"),
  MAX_RETRIES: z.coerce.number().default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().default(500),
  HTTP_TIMEOUT_MS: z.coerce.number().default(30000),
});

export const env = envSchema.parse(process.env);
