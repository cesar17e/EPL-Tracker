import { Router } from "express";
import { pool } from "../db/pool.js";

//A simple health route to see if connection is all good

const router = Router();

router.get("/", async (_req, res) => {
  const r = await pool.query("SELECT 1 AS ok");
  res.json({ ok: true, db: r.rows[0] });
});

export default router;
