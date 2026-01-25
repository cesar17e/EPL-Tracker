import type { Request, Response, NextFunction } from "express";
import { syncEplMini } from "../services/eplSync.service.js";

export async function runEplMiniSync(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await syncEplMini();
    return res.json({ message: "Sync complete", ...result });
  } catch (err) {
    next(err);
  }
}
