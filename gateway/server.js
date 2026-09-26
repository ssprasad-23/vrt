import express from "express";
import dotenv from "dotenv";
import gatewayRouter from "./src/routes/gatewayRoutes.js";
import { log, logError } from "./src/utility/logger.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Deliberately no express.json() here — this is a pure passthrough proxy, so the
// request body is streamed straight to the upstream service untouched. Parsing it
// here would consume the stream and break the proxy for POST/PUT bodies.
app.use("/", gatewayRouter);

// centralized error handler (catches next(err) calls, matching the other services)
app.use((err, req, res, next) => {
  logError(err);
  res.status(500).json({ status: 500, message: "Something went wrong", data: null });
});

app.listen(PORT, () => {
  log(`API gateway running at http://localhost:${PORT}`);
});
