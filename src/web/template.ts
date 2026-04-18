import type { Topic } from "../models/topic.js";
import type { VideoJob } from "../models/video-job.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function badge(status: string): string {
  const color =
    status === "approved_for_render"
      ? "#0a7a3d"
      : status === "awaiting_approval"
        ? "#d97706"
        : status === "approved"
          ? "#0a7a3d"
          : "#374151";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${color};color:#fff;font-size:12px">${escapeHtml(status)}</span>`;
}

export function renderDashboard(topics: Topic[], jobs: VideoJob[]): string {
  const topicRows = topics
    .map(
      (topic) => `<tr>
        <td>${escapeHtml(topic.title)}</td>
        <td>${escapeHtml(topic.description)}</td>
        <td>${badge(topic.status)}</td>
        <td>${
          topic.status === "pending"
            ? `<form method="post" action="/dashboard/actions/topics/${encodeURIComponent(topic.id)}/approve"><button type="submit">Approve topic</button></form>`
            : "-"
        }</td>
      </tr>`,
    )
    .join("");

  const jobRows = jobs
    .map(
      (job) => `<tr>
        <td><code>${escapeHtml(job.videoId)}</code></td>
        <td>${escapeHtml(job.topicTitle)}</td>
        <td>${badge(job.status)}</td>
        <td>${job.approvals.topicApproved ? "yes" : "no"}</td>
        <td>${job.approvals.scriptApproved ? "yes" : "no"}</td>
        <td>${job.approvals.finalRenderApproved ? "yes" : "no"}</td>
        <td style="display:flex;gap:8px;flex-wrap:wrap;">
          ${
            !job.approvals.scriptApproved
              ? `<form method="post" action="/dashboard/actions/jobs/${encodeURIComponent(job.videoId)}/approve-script"><button type="submit">Approve script</button></form>`
              : ""
          }
          ${
            !job.approvals.finalRenderApproved
              ? `<form method="post" action="/dashboard/actions/jobs/${encodeURIComponent(job.videoId)}/approve-final-render"><button type="submit">Approve final render</button></form>`
              : `<form method="post" action="/dashboard/actions/jobs/${encodeURIComponent(job.videoId)}/run"><button type="submit">Run render + upload</button></form>`
          }
        </td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI YouTube Approval Dashboard</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #f9fafb; }
    button { background: #111827; color: #fff; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; }
    .muted { color: #6b7280; }
    .panel { margin-bottom: 20px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>AI YouTube Channel Dashboard</h1>
  <p class="muted">Status flow enforced: <code>draft → awaiting_approval → approved_for_render</code></p>
  <div class="panel">
    <h3>Create topic</h3>
    <form method="post" action="/dashboard/actions/topics/new" style="display:flex;gap:8px;flex-wrap:wrap;">
      <input name="title" placeholder="Topic title" required />
      <input name="description" placeholder="Short description" required />
      <button type="submit">Add topic</button>
    </form>
  </div>
  <h2>topic_queue</h2>
  <table>
    <thead><tr><th>Title</th><th>Description</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>${topicRows || `<tr><td colspan="4">No topics yet.</td></tr>`}</tbody>
  </table>
  <h2>video_job_runner queue</h2>
  <table>
    <thead><tr><th>video_id</th><th>Topic</th><th>Status</th><th>Topic approved</th><th>Script approved</th><th>Final render approved</th><th>Actions</th></tr></thead>
    <tbody>${jobRows || `<tr><td colspan="7">No jobs yet.</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}
