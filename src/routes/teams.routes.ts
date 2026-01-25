import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { listTeams, getTeamSummary, getTeamMatches, getTeamForm } from "../controllers/teams.controller.js";
import rateLimiter from "../middleware/rateLimiter.js";

//Prefix api/teams/-->

const router = Router();

// Team list (home page)
router.get("/", requireAuth, listTeams);

// Team summary (last 3 ended + next 3 upcoming)
router.get("/:teamId/summary", requireAuth, getTeamSummary);

//All of the teams matches
router.get("/:teamId/matches", rateLimiter, requireAuth, getTeamMatches);

//Gets a list of stats to let user decide a teamks form
router.get("/:teamId/form", rateLimiter, requireAuth, getTeamForm);


export default router;
