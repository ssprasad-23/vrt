import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import db from "./src/config/configDB.js";
import initDb from "./src/data/createTable.js";
import authRouter from "./src/routes/authRouters.js";
import { log, logError } from "./src/utility/logger.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use("/", authRouter);

// centralized error handler (catches next(err) calls from the controller)
app.use((err, req, res, next) => {
  logError(err);
  res.status(500).json({ status: 500, message: "Something went wrong", data: null });
});

// startup sequence
(async () => {
  try {
    // Verify DB connectivity
    await db.query("SELECT 1");
    log("Database connected successfully");

    // Create tables if needed
    await initDb();

    // Start server AFTER DB is ready
    app.listen(PORT, () => {
      log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    logError("Startup failed:", err);
    process.exit(1);
  }
})();