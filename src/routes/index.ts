import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";

const router = Router();

/**
 * Mount feature routers under a common API prefix.
 */

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);

export default router;
