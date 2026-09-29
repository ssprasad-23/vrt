import express from "express";
import dotenv from "dotenv";
import db from "./src/config/configDB.js";
import initDb from "./src/data/createTable.js";
import videoRouter from "./src/routes/videoRouters.js";
import { log, logError } from "./src/utility/logger.js";
import { startTranscodeCompletedWorker } from "./src/worker/transcodeCompletedWorker.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use("/", videoRouter);

// centralized error handler (catches next(err) calls from the controller)
app.use((err, req, res, next) => {
  logError(err);
  res.status(500).json({ status: 500, message: "Something went wrongg", data: null });
});

// startup sequence
(async () => {
  try {
    // Verify DB connectivity
    await db.query("SELECT 1");
    log("Video database connected successfully");

    // Create tables if needed
    await initDb();

    // Listen for finished encodes (saves transcoded_s3_key) AFTER DB is ready
    startTranscodeCompletedWorker();

    // Start server AFTER DB is ready
    app.listen(PORT, () => {
      log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    logError("Startup failed:", err);
    process.exit(1);
  }
})();
