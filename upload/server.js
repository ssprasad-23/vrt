import express from "express";
import dotenv from "dotenv";
import db from "./src/config/configDB.js";
import initDb from "./src/data/createTable.js";
import videoRouter from "./src/routes/videoRouters.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use("/", videoRouter);

// centralized error handler (catches next(err) calls from the controller)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: 500, message: "Something went wrongg", data: null });
});

// startup sequence
(async () => {
  try {
    // Verify DB connectivity
    await db.query("SELECT 1");
    console.log("Video database connected successfully");

    // Create tables if needed
    await initDb();

    // Start server AFTER DB is ready
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
})();
