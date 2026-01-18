import { Router } from "express";
import { register, login, refresh, logout, verifyEmail, requestVerify } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlware/requireAuth.js"
import rateLimiter from "../middlware/rateLimiter.js";

//Routes for authentication

const router = Router();

router.post("/register", rateLimiter, register);
router.post("/login", rateLimiter, login);

//Refresh logic for tokens
router.post("/refresh", rateLimiter, refresh);
router.post("/logout", rateLimiter, logout);
router.get("/verify-email", verifyEmail); // link click 
router.post("/request-verify", requireAuth, rateLimiter, requestVerify); // resend link

// Example protected route to test access token:
router.get("/me", requireAuth, (req, res) => {
  // requireAuth attaches req.user
  // TS note: cast or use AuthedRequest type if you want strict typing in route
  // @ts-expect-error quick demo
  res.json({ user: req.user });
});

export default router;
