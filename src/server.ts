import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import routes from "./routes/index.js";
import { pool, shutdown } from "./db/pool.js";

dotenv.config();

const app = express();

// If you later add a frontend on another origin, you will set FRONTEND_ORIGIN
// For now (Postman testing), this is fine:
app.use(
  cors({
    origin: "*", //All for now
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
