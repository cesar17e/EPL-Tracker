import { Router } from "express";
import {
  register,
  login,
  refresh,
  logout,
  verifyEmail,
  requestVerify,
  forgotPassword,
  getResetPasswordLink,
  resetPassword,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/requireAuth.js"
import type { AuthedRequest } from "../middleware/requireAuth.js";
import rateLimiter from "../middleware/rateLimiter.js";

//Routes for authentication

const router = Router();

router.post("/register", rateLimiter, register);
router.post("/login", rateLimiter, login);

//Refresh logic for tokens
router.post("/refresh", rateLimiter, refresh);
router.post("/logout", rateLimiter, logout);
 //This will be called when they click the verificaiton link send to their email
router.get("/verify-email", verifyEmail);
router.post("/request-verify", requireAuth, rateLimiter, requestVerify); // resend link
router.post("/forgot-password", rateLimiter, forgotPassword);
router.get("/reset-password", getResetPasswordLink);
router.post("/reset-password", rateLimiter, resetPassword);

// Example protected route to test access token:
router.get("/me", requireAuth, (req: AuthedRequest, res) => {
  // requireAuth attaches req.user
  res.json({ user: req.user });
});

export default router;
