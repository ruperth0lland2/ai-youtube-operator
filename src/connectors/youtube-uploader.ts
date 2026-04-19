import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { google } from "googleapis";
import type { Credentials, OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";

const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

interface ClientSecretsShape {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

interface ClientSecretsFile {
  web?: ClientSecretsShape;
  installed?: ClientSecretsShape;
}

export interface UploadVideoOptions {
  filePath: string;
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: "private" | "public" | "unlisted";
  scheduledPublishAt?: string;
}

export interface UploadVideoResult {
  youtubeVideoId: string;
  uploadTime: string;
  finalTitle: string;
  finalDescription: string;
  thumbnailStatus: "pending" | "missing" | "uploaded" | "unknown";
  videoUrl: string;
  privacyStatus: "private" | "public" | "unlisted";
  scheduledPublishAt?: string;
}

export type YouTubeUploaderModule = YouTubeUploader;

function openBrowser(url: string): void {
  try {
    if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
      return;
    }
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
      return;
    }
    spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    // No-op; URL is still logged for manual copy-paste.
  }
}

export class YouTubeUploader {
  private oauthClientPromise?: Promise<OAuth2Client>;

  async uploadVideo(options: UploadVideoOptions): Promise<UploadVideoResult> {
    return withRetry(
      async () => {
        const auth = await this.getOAuthClient();
        const youtube = google.youtube({ version: "v3", auth });
        const uploadTime = new Date().toISOString();

        const privacyStatus = options.privacyStatus ?? "private";
        const effectivePrivacy =
          options.scheduledPublishAt && privacyStatus !== "private" ? "private" : privacyStatus;

        if (options.scheduledPublishAt && privacyStatus !== "private") {
          logger.warn("Scheduled publish forces privacyStatus=private on YouTube", {
            requested: privacyStatus,
          });
        }

        const response = await youtube.videos.insert({
          part: ["snippet", "status"],
          uploadType: "resumable",
          requestBody: {
            snippet: {
              title: options.title,
              description: options.description,
              tags: options.tags ?? [],
              categoryId: options.categoryId ?? "22",
            },
            status: {
              privacyStatus: effectivePrivacy,
              publishAt: options.scheduledPublishAt,
            },
          },
          media: {
            body: fs.createReadStream(options.filePath),
          },
        });

        const video = response.data;
        const youtubeVideoId = video.id ?? `missing-id-${randomUUID()}`;
        const finalTitle = video.snippet?.title ?? options.title;
        const finalDescription = video.snippet?.description ?? options.description;
        const thumbnailStatus: UploadVideoResult["thumbnailStatus"] = video.snippet?.thumbnails
          ? "uploaded"
          : "missing";

        return {
          youtubeVideoId,
          uploadTime,
          finalTitle,
          finalDescription,
          thumbnailStatus,
          videoUrl: `https://youtube.com/watch?v=${youtubeVideoId}`,
          privacyStatus: effectivePrivacy,
          scheduledPublishAt: options.scheduledPublishAt,
        };
      },
      {
        operation: "youtube.resumable_upload",
        attempts: env.YOUTUBE_UPLOAD_MAX_RETRIES,
        baseDelayMs: env.RETRY_BASE_DELAY_MS,
      },
    );
  }

  private async getOAuthClient(): Promise<OAuth2Client> {
    if (!this.oauthClientPromise) {
      this.oauthClientPromise = this.initOAuthClient();
    }
    return this.oauthClientPromise;
  }

  private async initOAuthClient(): Promise<OAuth2Client> {
    const secrets = await this.loadClientSecrets();
    const redirectUri = this.resolveRedirectUri(secrets.redirect_uris);
    const oauthClient = new google.auth.OAuth2(
      secrets.client_id,
      secrets.client_secret,
      redirectUri,
    );

    const storedToken = await this.readTokenIfPresent();
    if (storedToken) {
      oauthClient.setCredentials(storedToken);
      return oauthClient;
    }

    const authCode = await this.runLocalConsentFlow(oauthClient, redirectUri);
    const tokenResponse = await oauthClient.getToken(authCode);
    oauthClient.setCredentials(tokenResponse.tokens);
    await this.persistToken(tokenResponse.tokens);
    return oauthClient;
  }

  private async loadClientSecrets(): Promise<ClientSecretsShape> {
    const raw = await fsp.readFile(env.YOUTUBE_CLIENT_SECRETS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ClientSecretsFile;
    const secrets = parsed.installed ?? parsed.web;
    if (!secrets) {
      throw new Error("client_secrets.json must contain installed or web OAuth client settings");
    }
    return secrets;
  }

  private resolveRedirectUri(redirectUris: string[]): string {
    if (env.YOUTUBE_OAUTH_REDIRECT_URI) {
      return env.YOUTUBE_OAUTH_REDIRECT_URI;
    }
    return redirectUris[0] ?? "http://127.0.0.1:53682/oauth2callback";
  }

  private async runLocalConsentFlow(oauthClient: OAuth2Client, redirectUri: string): Promise<string> {
    const redirectUrl = new URL(redirectUri);
    const authUrl = oauthClient.generateAuthUrl({
      access_type: "offline",
      scope: [YOUTUBE_UPLOAD_SCOPE],
      prompt: "consent",
    });

    logger.info("Starting one-time local browser consent flow", {
      scope: YOUTUBE_UPLOAD_SCOPE,
      authUrl,
    });
    openBrowser(authUrl);

    return new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => {
        const requestUrl = new URL(req.url ?? "/", `http://${redirectUrl.host}`);
        if (requestUrl.pathname !== redirectUrl.pathname) {
          res.writeHead(404).end("Not Found");
          return;
        }

        const error = requestUrl.searchParams.get("error");
        const code = requestUrl.searchParams.get("code");

        if (error) {
          res.writeHead(400).end(`OAuth error: ${error}`);
          cleanup();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400).end("Missing OAuth code");
          cleanup();
          reject(new Error("Missing OAuth code"));
          return;
        }

        res.writeHead(200).end("YouTube authorization complete. You can close this tab.");
        cleanup();
        resolve(code);
      });

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for OAuth consent callback"));
      }, env.YOUTUBE_OAUTH_TIMEOUT_MS);

      const cleanup = (): void => {
        clearTimeout(timeout);
        server.close();
      };

      const port = Number(redirectUrl.port || 80);
      server.listen(port, redirectUrl.hostname, () => {
        logger.info("OAuth callback server listening", { redirectUri });
      });
    });
  }

  private async readTokenIfPresent(): Promise<Credentials | undefined> {
    try {
      const raw = await fsp.readFile(env.YOUTUBE_TOKEN_FILE, "utf-8");
      return JSON.parse(raw) as Credentials;
    } catch {
      return undefined;
    }
  }

  private async persistToken(tokens: Credentials): Promise<void> {
    await fsp.mkdir(path.dirname(env.YOUTUBE_TOKEN_FILE), { recursive: true });
    await fsp.writeFile(env.YOUTUBE_TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf-8");
  }
}
