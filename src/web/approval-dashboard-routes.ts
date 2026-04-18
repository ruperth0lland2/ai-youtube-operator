import { Router, type ErrorRequestHandler } from "express";
import type { JsonJobQueue } from "../queue/json-job-queue.js";
import type { TopicQueueService } from "../services/topic-queue-service.js";
import type { VideoJobRunnerService } from "../services/video-job-runner-service.js";
import { renderDashboard } from "./template.js";
import { logger } from "../utils/logger.js";

export function createApprovalDashboardRouter(
  topicQueue: TopicQueueService,
  queue: JsonJobQueue,
  runner: VideoJobRunnerService,
): Router {
  const router = Router();

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

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    logger.error("dashboard action failed", { error: String(error) });
    res.status(500).send(`<pre>${String(error)}</pre><a href="/dashboard">Back to dashboard</a>`);
  };
  router.use(errorHandler);

  return router;
}
