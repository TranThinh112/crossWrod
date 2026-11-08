// auth.js - JWT, Password hashing, Refresh tokens, OAuth verification & Auth middleware
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { db } = require("./db");

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "crossword_jwt_access_secret_super_secure_key_2026";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "crossword_jwt_refresh_secret_super_secure_key_2026";
const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_DAYS = 14;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateTokens(user, deviceInfo = "") {
  const payload = {
    userId: user.id,
    email: user.email,
    fullName: user.full_name
  };

  const accessToken = jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });

  // Refresh token payload with unique jti (JWT ID)
  const refreshTokenId = crypto.randomUUID();
  const rawRefreshToken = jwt.sign({ ...payload, jti: refreshTokenId }, JWT_REFRESH_SECRET, {
    expiresIn: `${REFRESH_TOKEN_DAYS}d`
  });

  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Store refresh token hash in db
  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(refreshTokenId, user.id, tokenHash, deviceInfo, expiresAt);

  return { accessToken, refreshToken: rawRefreshToken };
}

function setRefreshTokenCookie(res, refreshToken) {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    path: "/api/auth"
  });
}

function clearRefreshTokenCookie(res) {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth"
  });
}

// Middleware: Authenticate Request via Bearer Token
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Yêu cầu đăng nhập để thực hiện chức năng này!" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
    const user = db.prepare("SELECT id, email, full_name, avatar_url, auth_provider FROM users WHERE id = ?").get(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: "Tài khoản không tồn tại hoặc đã bị xóa!" });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Access token đã hết hạn!", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "Token không hợp lệ!" });
  }
}

// Optional Auth (cho phép cả khách hoặc user đăng nhập)
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
      const user = db.prepare("SELECT id, email, full_name, avatar_url, auth_provider FROM users WHERE id = ?").get(decoded.userId);
      if (user) req.user = user;
    } catch (e) {
      // Ignored for optional
    }
  }
  next();
}

async function verifyGoogleToken(idToken) {
  if (!GOOGLE_CLIENT_ID) {
    // Development fallback mock decoding if client id is not yet configured in env
    try {
      const parts = idToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
        if (payload.email) {
          return {
            email: payload.email,
            name: payload.name || payload.email.split("@")[0],
            picture: payload.picture || "",
            sub: payload.sub || "google-" + Date.now()
          };
        }
      }
    } catch (e) {}
    throw new Error("Chưa cấu hình GOOGLE_CLIENT_ID trong môi trường hệ thống!");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();
  return {
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    sub: payload.sub
  };
}

module.exports = {
  hashPassword,
  comparePassword,
  hashToken,
  generateTokens,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  requireAuth,
  optionalAuth,
  verifyGoogleToken,
  JWT_REFRESH_SECRET
};