import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { sundayOnly } from "../middleware/sundayOnly.js";
import adminSyncRateLimiter from "../middleware/adminSyncRateLimiter.js";
import { runEplMiniSync } from "../controllers/admin.controller.js";

const router = Router();

// POST /api/admin/syncGames
//We need to be logged in, an admin, it must be sunday, rateLimited and then we can run the script
router.post("/sync-games", requireAuth, requireAdmin, sundayOnly, adminSyncRateLimiter, runEplMiniSync);

export default router;
