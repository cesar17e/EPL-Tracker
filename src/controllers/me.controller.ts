import type { Request, Response, NextFunction } from "express";
import * as meService from "../services/me.service.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";

/**
 * GET /api/me/settings
 * Returns current user settings needed for the UI toggle.
 */
export async function getMySettings(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const settings = await meService.getMySettings(req.user.id);
    return res.json(settings);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/me/settings
 * Body: { emailOptIn: boolean }
 *
 * Rules:
 * - Can always turn OFF
 * - Can only turn ON if email_verified = true
 */
export async function updateMySettings(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const emailOptIn = req.body?.emailOptIn; 
    if (typeof emailOptIn !== "boolean") {
      return res.status(400).json({ message: "emailOptIn must be a boolean" });
    }

    const updated = await meService.updateEmailOptIn(req.user.id, emailOptIn);
    return res.json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/me/favorites
 * Returns the user's favorite teams.
 */
export async function listMyFavorites(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const favorites = await meService.listMyFavorites(req.user.id);
    return res.json({ favorites });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/me/favorites
 * Body: { teamId: number }
 * Adding the same team twice won't error.
 */
export async function addMyFavorite(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const teamId = Number(req.body?.teamId);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ message: "Invalid teamId" });
    }

    await meService.addFavorite(req.user.id, teamId);
    return res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/me/favorites/:teamId
 * Removes a team from favorites.
 */
export async function removeMyFavorite(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const teamId = Number(req.params.teamId);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ message: "Invalid teamId" });
    }

    await meService.removeFavorite(req.user.id, teamId);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
