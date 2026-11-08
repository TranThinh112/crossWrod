// routes/templateRoutes.js
const express = require("express");
const { db } = require("../db");
const { optionalAuth, requireAuth } = require("../auth");
const { generateCrossword } = require("../generator");

const router = express.Router();

// Lấy danh sách template (TOEIC, IELTS, Giao tiếp)
router.get("/", (req, res) => {
  try {
    const templates = db.prepare(`
      SELECT id, category, title, description, word_count, badge, created_at
      FROM vocabulary_templates
      ORDER BY category ASC, id ASC
    `).all();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: "Lỗi tải kho template: " + err.message });
  }
});

// Xem chi tiết 1 template
router.get("/:id", (req, res) => {
  try {
    const tpl = db.prepare("SELECT * FROM vocabulary_templates WHERE id = ?").get(req.params.id);
    if (!tpl) {
      return res.status(404).json({ error: "Không tìm thấy bộ từ vựng này!" });
    }
    res.json(tpl);
  } catch (err) {
    res.status(500).json({ error: "Lỗi: " + err.message });
  }
});

// Clone template thành một bài tập crossword riêng cho user
router.post("/:id/clone", optionalAuth, (req, res) => {
  try {
    const tpl = db.prepare("SELECT * FROM vocabulary_templates WHERE id = ?").get(req.params.id);
    if (!tpl) {
      return res.status(404).json({ error: "Không tìm thấy bộ từ vựng!" });
    }

    // Xác định user: nếu đã đăng nhập thì gán user.id, nếu khách thì gán demo user
    let userId;
    if (req.user) {
      userId = req.user.id;
    } else {
      let demoUser = db.prepare("SELECT id FROM users WHERE email = ?").get("demo@crossword.local");
      if (!demoUser) {
        userId = "usr-demo-" + Date.now();
        db.prepare("INSERT INTO users (id, email, full_name, auth_provider) VALUES (?, ?, ?, ?)").run(userId, "demo@crossword.local", "Người dùng Khách", "local");
      } else {
        userId = demoUser.id;
      }
    }

    // Sinh crossword ngẫu nhiên từ raw_words_text của template
    const layout = generateCrossword(tpl.raw_words_text, { allowFewer: true, attempts: 45 });
    if (!layout.success) {
      return res.status(400).json({ error: "Không thể xếp ô chữ từ bộ từ này!" });
    }

    const exId = Date.now().toString();
    const title = `${tpl.title} (${new Date().toLocaleDateString("vi-VN")})`;

    db.prepare(`
      INSERT INTO exercises (
        id, user_id, template_id, title, raw_words_input, total_words, placed_words,
        width, height, grid_data, placements, clues
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      exId,
      userId,
      tpl.id,
      title,
      tpl.raw_words_text,
      layout.totalWords,
      layout.placedWords,
      layout.width,
      layout.height,
      JSON.stringify(layout.grid),
      JSON.stringify(layout.placements),
      JSON.stringify(layout.clues)
    );

    const created = {
      id: exId,
      user_id: userId,
      template_id: tpl.id,
      title,
      rawWordsInput: tpl.raw_words_text,
      totalWords: layout.totalWords,
      placedWords: layout.placedWords,
      width: layout.width,
      height: layout.height,
      grid: layout.grid,
      placements: layout.placements,
      clues: layout.clues
    };

    return res.json({
      success: true,
      message: `Đã tạo bài tập thành công từ bộ từ "${tpl.title}"!`,
      exercise: created
    });
  } catch (err) {
    console.error("Clone template error:", err);
    res.status(500).json({ error: "Lỗi sinh bài từ template: " + err.message });
  }
});

module.exports = router;