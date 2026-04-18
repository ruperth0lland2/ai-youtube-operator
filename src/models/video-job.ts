import type { Scene } from "./scene.js";

export type VideoStatus = "draft" | "awaiting_approval" | "approved_for_render";
export type RenderProvider = "runway" | "veo";

export interface VideoApprovals {
  topicApproved: boolean;
  scriptApproved: boolean;
  finalRenderApproved: boolean;
}

export interface VideoAssets {
  researchBriefPath?: string;
  scriptPath?: string;
  qaReportPath?: string;
  audioPath?: string;
  scenesPath?: string;
  renderPath?: string;
  providerJobsPath?: string;
  uploadPath?: string;
}

export interface SceneProviderJobRecord {
  sceneId: string;
  provider: "runway" | "veo";
  submittedAt: string;
  providerJobId: string;
  status: string;
  outputUri?: string;
}

export interface UploadPayload {
  provider: "youtube";
  uploadId: string;
  url: string;
  uploadedAt: string;
  uploadPath: string;
}

export interface VideoJob {
  videoId: string;
  topicId: string;
  topicTitle: string;
  status: VideoStatus;
  approvals: VideoApprovals;
  researchBrief?: string;
  script?: string;
  scenes: Scene[];
  renderProvider: RenderProvider;
  providerJobIds?: SceneProviderJobRecord[];
  assets: VideoAssets;
  uploadUrl?: string;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface JobStateFile {
  jobs: VideoJob[];
}
