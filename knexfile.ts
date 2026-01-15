import type { Knex } from "knex";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing in .env");
}

const config: { [key: string]: Knex.Config } = {
  development: {
    client: "pg",
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: "./migrations",
      extension: "ts",
    },
    pool: {
      min: 0,
      max: 5,
    },
  },
  production: {
    client: "pg",
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: "./migrations",
      extension: "ts",
    },
    pool: {
      min: 0,
      max: 5,
    },
    // Neon needs SSL in many environments:
    ssl: { rejectUnauthorized: false } as any,
  },
};

export default config;
