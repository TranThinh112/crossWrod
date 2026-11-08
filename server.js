// server.js - Multi-user Crossword Learning Server
require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");

const { initDatabase } = require("./db");
const authRoutes = require("./routes/authRoutes");
const templateRoutes = require("./routes/templateRoutes");
const exerciseRoutes = require("./routes/exerciseRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SQLite database, tables, and seed templates
initDatabase();

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Route /docs: Giao dien va mo ta toan bo chuc nang he thong
app.get("/docs", (req, res) => {
  if (req.headers.accept && req.headers.accept.includes("application/json") && !req.headers.accept.includes("text/html")) {
    return res.json({
      name: "Smart Crossword Generator Multi-User API",
      version: "2.0.0",
      description: "He thong sinh crossword da nguoi dung, xac thuc JWT Access/Refresh Token, Google OAuth, kho template TOEIC/IELTS",
      modules: {
        auth: "/api/auth/* (register, login, google, refresh, logout, forgot-password, reset-password, me)",
        templates: "/api/templates/* (list, detail, clone)",
        exercises: "/api/exercises/* (generate, list, get, rename, delete, batch-delete, regenerate-layout)"
      },
      docsUrl: "/docs"
    });
  }
  res.sendFile(path.join(__dirname, "public", "docs.html"));
});

// Reset password HTML page
app.get("/reset-password", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "reset-password.html"));
});

// RESTful API Routers
app.use("/api/auth", authRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/exercises", exerciseRoutes);

app.listen(PORT, () => {
  console.log(`Crossword Learning Server running at http://localhost:${PORT}`);
});