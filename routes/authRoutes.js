// routes/authRoutes.js
const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { db } = require("../db");
const {
  hashPassword,
  comparePassword,
  hashToken,
  generateTokens,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  requireAuth,
  verifyGoogleToken,
  JWT_REFRESH_SECRET
} = require("../auth");

const router = express.Router();

// 1. REGISTER (Đăng ký tài khoản)
router.post("/register", (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: "Vui lòng nhập đầy đủ họ tên, email và mật khẩu!" });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(trimmedEmail);
    if (existing) {
      return res.status(400).json({ error: "Email này đã được đăng ký tài khoản!" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Mật khẩu phải chứa ít nhất 6 ký tự!" });
    }

    const userId = "usr-" + crypto.randomUUID();
    const passwordHash = hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, auth_provider, is_verified)
      VALUES (?, ?, ?, ?, 'local', 1)
    `).run(userId, trimmedEmail, passwordHash, fullName.trim());

    const newUser = db.prepare("SELECT id, email, full_name, avatar_url, auth_provider FROM users WHERE id = ?").get(userId);
    const { accessToken, refreshToken } = generateTokens(newUser, req.headers["user-agent"]);
    setRefreshTokenCookie(res, refreshToken);

    return res.json({
      success: true,
      message: "Đăng ký tài khoản thành công!",
      user: newUser,
      accessToken
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Lỗi máy chủ khi đăng ký: " + err.message });
  }
});

// 2. LOGIN (Đăng nhập Email & Mật khẩu)
router.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Vui lòng nhập email và mật khẩu!" });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(trimmedEmail);
    if (!user) {
      return res.status(400).json({ error: "Tài khoản hoặc mật khẩu không chính xác!" });
    }

    if (!user.password_hash) {
      return res.status(400).json({ error: "Tài khoản này được đăng ký qua Google. Vui lòng sử dụng Đăng nhập bằng Google!" });
    }

    if (!comparePassword(password, user.password_hash)) {
      return res.status(400).json({ error: "Tài khoản hoặc mật khẩu không chính xác!" });
    }

    const { accessToken, refreshToken } = generateTokens(user, req.headers["user-agent"]);
    setRefreshTokenCookie(res, refreshToken);

    const safeUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      authProvider: user.auth_provider
    };

    return res.json({
      success: true,
      message: "Đăng nhập thành công!",
      user: safeUser,
      accessToken
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Lỗi máy chủ khi đăng nhập: " + err.message });
  }
});

// 3. GOOGLE OAUTH LOGIN / SIGNUP
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: "Thiếu mã xác thực Google Credential!" });
    }

    const googleData = await verifyGoogleToken(credential);
    const trimmedEmail = googleData.email.trim().toLowerCase();

    let user = db.prepare("SELECT * FROM users WHERE email = ?").get(trimmedEmail);

    if (!user) {
      const userId = "usr-" + crypto.randomUUID();
      db.prepare(`
        INSERT INTO users (id, email, full_name, avatar_url, auth_provider, provider_id, is_verified)
        VALUES (?, ?, ?, ?, 'google', ?, 1)
      `).run(userId, trimmedEmail, googleData.name || "Google User", googleData.picture || "", googleData.sub);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    } else {
      // Update avatar if not set
      if (!user.avatar_url && googleData.picture) {
        db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(googleData.picture, user.id);
        user.avatar_url = googleData.picture;
      }
    }

    const { accessToken, refreshToken } = generateTokens(user, req.headers["user-agent"]);
    setRefreshTokenCookie(res, refreshToken);

    const safeUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      authProvider: user.auth_provider
    };

    return res.json({
      success: true,
      message: "Đăng nhập Google thành công!",
      user: safeUser,
      accessToken
    });
  } catch (err) {
    console.error("Google Auth error:", err);
    return res.status(400).json({ error: "Xác thực Google thất bại: " + err.message });
  }
});

// 4. REFRESH TOKEN (Cấp mới Access Token & Xoay vòng Refresh Token)
router.post("/refresh", (req, res) => {
  try {
    const token = req.cookies.refreshToken || req.body.refreshToken;
    if (!token) {
      return res.status(401).json({ error: "Không tìm thấy refresh token!" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    } catch (e) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({ error: "Refresh token đã hết hạn hoặc không hợp lệ, vui lòng đăng nhập lại!" });
    }

    const tokenHash = hashToken(token);
    const storedToken = db.prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?").get(tokenHash);

    if (!storedToken || storedToken.is_revoked) {
      clearRefreshTokenCookie(res);
      // Revoke all tokens for this user if potential reuse detected
      if (storedToken && storedToken.is_revoked) {
        db.prepare("UPDATE refresh_tokens SET is_revoked = 1 WHERE user_id = ?").run(decoded.userId);
      }
      return res.status(401).json({ error: "Phiên đăng nhập đã bị hủy, vui lòng đăng nhập lại!" });
    }

    // Revoke old refresh token (Token Rotation)
    db.prepare("UPDATE refresh_tokens SET is_revoked = 1 WHERE id = ?").run(storedToken.id);

    const user = db.prepare("SELECT id, email, full_name, avatar_url, auth_provider FROM users WHERE id = ?").get(decoded.userId);
    if (!user) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({ error: "Người dùng không tồn tại!" });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user, req.headers["user-agent"]);
    setRefreshTokenCookie(res, newRefreshToken);

    return res.json({
      success: true,
      accessToken,
      user
    });
  } catch (err) {
    console.error("Refresh error:", err);
    return res.status(500).json({ error: "Lỗi làm mới token: " + err.message });
  }
});

// 5. LOGOUT (Đăng xuất)
router.post("/logout", (req, res) => {
  try {
    const token = req.cookies.refreshToken || req.body.refreshToken;
    if (token) {
      const tokenHash = hashToken(token);
      db.prepare("UPDATE refresh_tokens SET is_revoked = 1 WHERE token_hash = ?").run(tokenHash);
    }
    clearRefreshTokenCookie(res);
    return res.json({ success: true, message: "Đăng xuất thành công!" });
  } catch (err) {
    return res.status(500).json({ error: "Lỗi đăng xuất: " + err.message });
  }
});

// 6. FORGOT PASSWORD (Yêu cầu đặt lại mật khẩu)
router.post("/forgot-password", (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Vui lòng cung cấp email!" });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(trimmedEmail);

    // Dù email có tồn tại hay không, trả về thông báo chung để chống enumeration attack
    if (!user) {
      return res.json({
        success: true,
        message: "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đi."
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetId = "rst-" + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 phút

    db.prepare(`
      INSERT INTO password_resets (id, user_id, reset_token, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(resetId, user.id, resetToken, expiresAt);

    // Trong môi trường Local hoặc chưa gắn SMTP thật, in link reset ra terminal để test nhanh
    const resetUrl = `${req.protocol}://${req.get("host")}/reset-password?token=${resetToken}`;
    console.log(`\n[PASSWORD RESET EMAIL SIMULATION]\nTo: ${user.email}\nReset URL: ${resetUrl}\n`);

    return res.json({
      success: true,
      message: "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đi.",
      // Gửi kèm link trong response nếu đang ở môi trường dev để test trực tiếp
      devResetUrl: process.env.NODE_ENV !== "production" ? resetUrl : undefined,
      resetToken: process.env.NODE_ENV !== "production" ? resetToken : undefined
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Lỗi xử lý yêu cầu: " + err.message });
  }
});

// 7. RESET PASSWORD (Thực hiện đổi mật khẩu mới)
router.post("/reset-password", (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: "Vui lòng nhập đầy đủ token và mật khẩu mới!" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Mật khẩu mới phải có ít nhất 6 ký tự!" });
    }

    const record = db.prepare(`
      SELECT * FROM password_resets 
      WHERE reset_token = ? AND is_used = 0 AND expires_at > datetime('now')
    `).get(token);

    if (!record) {
      return res.status(400).json({ error: "Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn (chỉ có hiệu lực trong 15 phút)!" });
    }

    // Đổi mật khẩu
    const passwordHash = hashPassword(newPassword);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, record.user_id);

    // Đánh dấu token đã dùng
    db.prepare("UPDATE password_resets SET is_used = 1 WHERE id = ?").run(record.id);

    // Thu hồi toàn bộ refresh token cũ của user trên các thiết bị
    db.prepare("UPDATE refresh_tokens SET is_revoked = 1 WHERE user_id = ?").run(record.user_id);
    clearRefreshTokenCookie(res);

    return res.json({
      success: true,
      message: "Đặt lại mật khẩu thành công! Vui lòng đăng nhập với mật khẩu mới."
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ error: "Lỗi đặt lại mật khẩu: " + err.message });
  }
});

// 8. GET ME (Lấy thông tin tài khoản hiện tại)
router.get("/me", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      fullName: req.user.full_name,
      avatarUrl: req.user.avatar_url,
      authProvider: req.user.auth_provider
    }
  });
});

module.exports = router;