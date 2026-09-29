import express from "express";
import dotenv from "dotenv";
import db from "./src/config/configDB.js";
import feedRouter from "./src/routes/feedRouters.js";
import { log, logError } from "./src/utility/logger.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());
app.use("/", feedRouter);

// centralized error handler (catches next(err) calls from the controller)
app.use((err, req, res, next) => {
  logError(err);
  res.status(500).json({ status: 500, message: "Something went wrong", data: null });
});

// startup sequence
(async () => {
  try {
    // Verify DB connectivity. The videos table is owned (and created) by the upload
    // service — this service only reads it, so there's no initDb() here.
    await db.query("SELECT 1");
    log("Feed database connected successfully");

    app.listen(PORT, () => {
      log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    logError("Startup failed:", err);
    process.exit(1);
  }
})();
