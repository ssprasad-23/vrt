import express from "express";
import dotenv from "dotenv";
import db from "./src/config/configDB.js";
import initDb from "./src/data/createTable.js";
import transcodeRouter from "./src/routes/transcodeRouters.js";
import { startTranscodeWorker } from "./src/worker/transcodeWorker.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());
app.use("/", transcodeRouter);

// centralized error handler (catches next(err) calls from the controller)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: 500, message: "Something went wrong", data: null });
});

// startup sequence
(async () => {
  try {
    // Verify DB connectivity
    await db.query("SELECT 1");
    console.log("Transcode database connected successfully");

    // Create tables if needed
    await initDb();

    // Start the BullMQ worker (consumes { videoId, url } jobs off the transcode queue)
    // and the HTTP server AFTER DB is ready
    startTranscodeWorker();

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
})();
