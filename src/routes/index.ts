import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import teamsRoutes from "./teams.routes.js";


const router = Router();

/**
 * Mount feature routers under a common API prefix --> app.use("/api", routes);
 */

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/teams", teamsRoutes);


export default router;
