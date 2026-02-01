import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import rateLimiter from "../middleware/rateLimiter.js";
// import { requireVerifiedEmail } from "../middleware/requireVerifiedEmail.js";

import {
  getMySettings,
  updateMySettings,
  listMyFavorites,
  addMyFavorite,
  removeMyFavorite,
} from "../controllers/me.controller.js";

const router = Router();

/**
 * Gets the list of users settings
 * emailOptIn can only be turned ON if email is verified
 */
router.get("/settings", requireAuth, getMySettings);

// For turning on email, we enforce verified email inside controller (so PATCH supports turning OFF too)
router.patch("/settings", requireAuth, rateLimiter, updateMySettings);

//Users favorites, we get, post, and delete them form the db
router.get("/favorites", requireAuth, listMyFavorites);
router.post("/favorites", requireAuth, rateLimiter, addMyFavorite);
router.delete("/favorites/:teamId", requireAuth, rateLimiter, removeMyFavorite);

export default router;
