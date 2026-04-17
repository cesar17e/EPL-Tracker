import { Router } from "express";

//A simpe health route that doesnt query to the db

const router = Router();

router.get("/", (_req, res) => {
  res.json({ ok: true, service: "running" });
});

export default router;