import dotenv from "dotenv";
import db from "./src/config/configDB.js";
import initDb from "./src/data/createTable.js";
import { startTranscodeWorker } from "./src/worker/transcodeWorker.js";
import { log, logError } from "./src/utility/logger.js";

dotenv.config();

// startup sequence
(async () => {
  try {
    // Verify DB connectivity
    await db.query("SELECT 1");
    log("Transcode database connected successfully");

    // Create tables if needed
    await initDb();

    // Start the SQS worker (polls { videoId, key } messages off the transcode queue) AFTER DB is ready
    startTranscodeWorker();
  } catch (err) {
    logError("Startup failed:", err);
    process.exit(1);
  }
})();
