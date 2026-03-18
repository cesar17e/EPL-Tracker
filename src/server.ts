import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import routes from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

dotenv.config();

import { pool, shutdown } from "./db/pool.js";


const app = express();
const trustProxy = Number(process.env.TRUST_PROXY ?? 1);
app.set("trust proxy", Number.isFinite(trustProxy) ? trustProxy : 1);

const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, Postman, Render health checks)
      if (!origin || allowedOrigins.includes(origin)) {
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
const PORT = Number(process.env.PORT || 3001);

async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log("Postgres connection successful");

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to connect to Postgres:", err);
    await shutdown("Exiting due to DB connection failure", 1);
  }
}

startServer();
