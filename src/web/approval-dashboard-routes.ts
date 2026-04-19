import { Router, type ErrorRequestHandler } from "express";
import type { JsonJobQueue } from "../queue/json-job-queue.js";
import type { TopicQueueService } from "../services/topic-queue-service.js";
import type { VideoJobRunnerService } from "../services/video-job-runner-service.js";
import { renderDashboard } from "./template.js";
import { logger } from "../utils/logger.js";
import {
  requireDashboardAuth,
  setDashboardSession,
  clearDashboardSession,
} from "./dashboard-auth-middleware.js";
import { env } from "../config/env.js";

export function createApprovalDashboardRouter(
  topicQueue: TopicQueueService,
  queue: JsonJobQueue,
  runner: VideoJobRunnerService,
): Router {
  const router = Router();

  router.get("/login", (_req, res) => {
    res.status(200).send(`
      <html><body style="font-family:Arial;padding:24px;">
      <h2>Dashboard Login</h2>
      <form method="post" action="/dashboard/login">
        <input type="password" name="password" placeholder="Password" required />
        <button type="submit">Sign in</button>
      </form>
      </body></html>
    `);
  });

  router.post("/login", (req, res) => {
    const password = String(req.body.password ?? "");
    if (!env.DASHBOARD_PASSWORD || password !== env.DASHBOARD_PASSWORD) {
      res.status(401).send("Invalid password");
      return;
    }
    setDashboardSession(res);
    res.redirect("/");
  });

  router.post("/logout", (_req, res) => {
    clearDashboardSession(res);
    res.redirect("/dashboard/login");
  });

  router.use(requireDashboardAuth);

  router.get("/", async (_req, res, next) => {
    try {
      const [topics, jobs] = await Promise.all([topicQueue.listTopics(), queue.listJobs()]);
      res.status(200).send(renderDashboard(topics, jobs));
    } catch (error) {
      next(error);
    }
  });

  router.post("/actions/topics/new", async (req, res, next) => {
    try {
      const title = String(req.body.title ?? "").trim();
      const description = String(req.body.description ?? "").trim();
      if (!title || !description) {
        throw new Error("Both topic title and description are required");
      }
      await topicQueue.addTopic(title, description);
      res.redirect("/");
    } catch (error) {
      next(error);
    }
  });

  router.post("/actions/topics/:topicId/approve", async (req, res, next) => {
    try {
      await runner.approveTopic(req.params.topicId);
      res.redirect("/");
    } catch (error) {
      next(error);
    }
  });

  router.post("/actions/jobs/:videoId/approve-script", async (req, res, next) => {
    try {
      await runner.approveScript(req.params.videoId);
      res.redirect("/");
    } catch (error) {
      next(error);
    }
  });

  router.post("/actions/jobs/:videoId/approve-final-render", async (req, res, next) => {
    try {
      await runner.approveFinalRender(req.params.videoId);
      res.redirect("/");
    } catch (error) {
      next(error);
    }
  });

  router.post("/actions/jobs/:videoId/run", async (req, res, next) => {
    try {
      await runner.runApprovedJob(req.params.videoId);
      res.redirect("/");
    } catch (error) {
      next(error);
    }
  });

  router.post("/actions/pilot", async (_req, res, next) => {
    try {
      const topic = await topicQueue.addTopic(
        "Why plumbing businesses lose leads after 5pm",
        "Pilot seed topic to validate full workflow and approvals.",
      );
      await runner.approveTopic(topic.id);
      res.redirect("/");
    } catch (error) {
      next(error);
    }
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    logger.error("dashboard action failed", { error: String(error) });
    res.status(500).send(`<pre>${String(error)}</pre><a href="/dashboard">Back to dashboard</a>`);
  };
  router.use(errorHandler);

  return router;
}
