import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import routes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import {
  getAllowedOrigins,
  getEmailMode,
  getPort,
  getPublicBaseUrl,
  isAllowedOrigin,
  validateStartupConfig,
} from "./config/env.js";

dotenv.config();

import { pool, shutdown } from "./db/pool.js";


const app = express();
const trustProxy = Number(process.env.TRUST_PROXY ?? 1);
app.set("trust proxy", Number.isFinite(trustProxy) ? trustProxy : 1);

const allowedOrigins = getAllowedOrigins();

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, Postman, Render health checks)
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      const corsError = new Error(`Origin not allowed by CORS: ${origin}`) as Error & {
        status?: number;
      };
      corsError.status = 403;
      callback(corsError);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Routes, we will use a global routes, this goes to index.ts and nest from there
app.use("/api", routes);
app.use(notFoundHandler);
app.use(errorHandler);

// Health check + DB test on startup
const PORT = getPort();

async function startServer() {
  try {
    const warnings = validateStartupConfig();
    for (const warning of warnings) {
      console.warn(`[startup] ${warning}`);
    }

    await pool.query("SELECT 1");
    console.log("Postgres connection successful");
    console.log("Startup config:", {
      nodeEnv: process.env.NODE_ENV ?? "development",
      port: PORT,
      publicBaseUrl: getPublicBaseUrl(),
      allowedOrigins,
      emailMode: getEmailMode(),
    });

    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    await shutdown("Exiting due to startup failure", 1);
  }
}

startServer();
