import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const { app, poller } = createApp();
  app.listen(env.PORT, () => {
    logger.info("AI YouTube Operator running", {
      port: env.PORT,
      dashboard: `http://localhost:${env.PORT}/`,
    });
    poller.start();
  });
}

main().catch((error) => {
  logger.error("Fatal startup error", { error: String(error) });
  process.exit(1);
});
