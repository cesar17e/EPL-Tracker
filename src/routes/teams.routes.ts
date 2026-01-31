import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { listTeams, getTeamSummary, getTeamMatches, getTeamForm, getTeamTrends, getTeamFixtureDifficulty } from "../controllers/teams.controller.js";
import rateLimiter from "../middleware/rateLimiter.js";

//Prefix api/teams/-->

const router = Router();

// Team list (home page)
router.get("/", requireAuth, listTeams);

// Team summary (last 3 ended + next 3 upcoming)
router.get("/:teamId/summary", requireAuth, getTeamSummary);

//All of the teams matches
router.get("/:teamId/matches", requireAuth,  rateLimiter, getTeamMatches);

//Gets a list of stats to let user decide a teams curent form based on their last N games, we can add a query on our req --> /api/teams/:teamId/form?matches=N
//This answers the question --> What’s the team’s current form right now based on their last N games
//Call N=15 for meaningful form data
router.get("/:teamId/form", requireAuth, rateLimiter, getTeamForm);

//Gets a rolling list of stats that shows the teams form throughout specific time windows. Lets us see if a teams form is increasing or decreasing. A trends endpoint!
//This allows for two queries how many matches(N) you want and a window(M) to swoop for stats for these matches 
//Example --> /api/teams/:teamId/form?matches=N&window=M
//Alows us to see how form changes through time
router.get("/:teamId/trends", requireAuth, rateLimiter, getTeamTrends);

//Fixture difficulty (next N fixtures scored by opponent strength)
router.get("/:teamId/fixture-difficulty",requireAuth, getTeamFixtureDifficulty);
  
  

export default router;
