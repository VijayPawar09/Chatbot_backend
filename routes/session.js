import express from "express";
const router = express.Router();

// Get session chat history
router.get("/history", (req, res) => {
  res.json({ history: req.session.history || [] });
});

// Clear/reset session chat history
router.post("/reset", (req, res) => {
  req.session.history = [];
  res.json({ message: "Session history cleared" });
});

export default router;
