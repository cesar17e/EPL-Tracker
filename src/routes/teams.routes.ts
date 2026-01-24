import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { listTeams, getTeamSummary, getTeamMatches } from "../controllers/teams.controller.js";


const router = Router();

// Team list (home page)
router.get("/", requireAuth, listTeams);

// Team summary (last 3 ended + next 3 upcoming)
router.get("/:teamId/summary", requireAuth, getTeamSummary);

//All of the teams matches
router.get("/:teamId/matches", requireAuth, getTeamMatches);


export default router;
