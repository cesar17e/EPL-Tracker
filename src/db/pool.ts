import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const shutdown = async (message: string, exitCode = 0) => {
  console.log(message);
  try {
    await pool.end();
    console.log("PostgreSQL pool closed");
  } catch (err) {
    console.error("Error during shutdown:", err);
  } finally {
    process.exit(exitCode);
  }
};

// Handle termination signals
process.on("SIGINT", () => shutdown("SIGINT received. Shutting down..."));
process.on("SIGTERM", () => shutdown("SIGTERM received. Shutting down..."));