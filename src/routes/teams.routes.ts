import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { listTeams, getTeamSummary, getTeamMatches, getTeamForm, getTeamTrends } from "../controllers/teams.controller.js";
import rateLimiter from "../middleware/rateLimiter.js";

//Prefix api/teams/-->

const router = Router();

// Team list (home page)
router.get("/", requireAuth, listTeams);

// Team summary (last 3 ended + next 3 upcoming)
router.get("/:teamId/summary", requireAuth, getTeamSummary);

//All of the teams matches
router.get("/:teamId/matches", rateLimiter, requireAuth, getTeamMatches);

//Gets a list of stats to let user decide a teams curent form based on their last N games, we can add a query on our req --> /api/teams/:teamId/form?matches=N
router.get("/:teamId/form", rateLimiter, requireAuth, getTeamForm);

//Gets a rolling list of stats that shows the teams form throughout specific time windows. Lets us see if a teams form is increasing or decreasing. A trends endpoint!
//This allows for two queries how many matches(N) you want and a window(M) to swoop for stats for these matches 
//Example --> /api/teams/:teamId/form?matches=N&window=M
router.get("/:teamId/trends", requireAuth, getTeamTrends);

export default router;
