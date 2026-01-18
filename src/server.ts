import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import routes from "./routes/index.js";

dotenv.config();

import { pool, shutdown } from "./db/pool.js";


const app = express();
app.set("trust proxy", 1); //for render

// If you later add a frontend on another origin, you will set FRONTEND_ORIGIN
// For now (Postman testing will do)
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// Routes, we will use a global routes
app.use("/api", routes);

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
