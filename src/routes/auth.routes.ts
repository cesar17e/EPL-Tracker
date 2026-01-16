import { Router } from "express";
import { register, login, refresh, logout } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlware/requireAuth.js"

//Routes for authentication

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);

// Example protected route to test access token:
router.get("/me", requireAuth, (req, res) => {
  // requireAuth attaches req.user
  // TS note: cast or use AuthedRequest type if you want strict typing in route
  // @ts-expect-error quick demo
  res.json({ user: req.user });
});

export default router;
