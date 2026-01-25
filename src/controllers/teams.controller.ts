import type { Request, Response, NextFunction } from "express";
import * as teamsService from "../services/teams.service.js";


/**
 * GET /api/teams
 *
 * Returns the list of all teams.
 * Used for the home page / team selection UI after login.
 * Delegates all work to the service layer
 */
export async function listTeams(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const teams = await teamsService.listTeams();
    return res.json(teams);
  } catch (err) {
    // Pass all errors to the centralized error handler
    next(err);
  }
}

/**
 * GET /api/teams/:teamId/summary
 *
 * Returns: team metadata, last 3 completed matches, next 3 upcoming fixtures
 *
 * Validates route params and delegates all logic to the service layer.
 */
export async function getTeamSummary(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    /**
     * Parse and validate the teamId path parameter.
     * Must be a positive integer.
     */
    const teamId = Number(req.params.teamId);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ message: "Invalid teamId" });
    }

    /**
     * Fetch the summary from the service layer.
     * Limits are defined here so the controller controls API shape,
     * while the service controls data retrieval.
     */
    const summary = await teamsService.getTeamSummary(teamId, {
      lastResultsLimit: 3,
      nextFixturesLimit: 3,
    });

    return res.json(summary);
  } catch (err) {
    // Any thrown error (including 404 from service) is handled centrally
    next(err);
  }
}

//Get all the teams matches from out database
export async function getTeamMatches(req: Request, res: Response, next: NextFunction) {
  try {
    const teamId = Number(req.params.teamId);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ message: "Invalid teamId" });
    }

    const typeRaw = String(req.query.type ?? "all");
    const type = (["all", "results", "fixtures"] as const).includes(typeRaw as any)
      ? (typeRaw as "all" | "results" | "fixtures")
      : "all";

    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const matches = await teamsService.getTeamMatches(teamId, { type, limit });
    return res.json(matches);
  } catch (err) {
    next(err);
  }
}


/*
  GET /api/teams/:teamId/form

  getTeam form returns an object full of stats for a team to let the user decide their form

  - Team id
  - Number of matches analyzed
  - Recent W/D/L sequence
  - Points & PPG
  - Goals For / Against / Difference
  - Clean sheets
  - Average goals
*/

export async function getTeamForm(req: Request, res: Response, next: NextFunction) {
  try {
    const teamId = Number(req.params.teamId);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      return res.status(400).json({ message: "Invalid teamId" });
    }

    const matchesRaw = Number(req.query.matches ?? 10);
    const matches = Number.isFinite(matchesRaw) ? Math.min(Math.max(matchesRaw, 1), 50) : 10;

    const form = await teamsService.getTeamForm(teamId, { matches });
    return res.json(form);
  } catch (err) {
    next(err);
  }
}

