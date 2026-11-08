// routes/exerciseRoutes.js
const express = require("express");
const { db } = require("../db");
const { optionalAuth, requireAuth } = require("../auth");
const { generateCrossword, parseWordList } = require("../generator");

const router = express.Router();

function getEffectiveUserId(req) {
  if (req.user && req.user.id) return req.user.id;
  // Fallback demo user for guest testing
  const demo = db.prepare("SELECT id FROM users WHERE email = ?").get("demo@crossword.local");
  return demo ? demo.id : "user-default-demo";
}

function getDefaultTitle() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

// 1. TẠO BÀI TẬP MỚI CHO USER
router.post("/generate", optionalAuth, (req, res) => {
  try {
    const { wordsText, title } = req.body;
    if (!wordsText || typeof wordsText !== "string") {
      return res.status(400).json({ error: "Vui lòng cung cấp danh sách từ vựng!" });
    }

    const parsed = parseWordList(wordsText);
    if (parsed.length < 15) {
      return res.status(400).json({
        error: `Bạn đã nhập ${parsed.length} từ hợp lệ. Cần tối thiểu 15 từ vựng để tạo bài tập crossword!`
      });
    }

    const layout = generateCrossword(wordsText);
    if (!layout.success) {
      return res.status(400).json({ error: layout.error || "Không thể tạo crossword từ các từ đã nhập!" });
    }

    const userId = getEffectiveUserId(req);
    const finalTitle = (title && title.trim()) ? title.trim() : getDefaultTitle();
    const id = Date.now().toString();

    db.prepare(`
      INSERT INTO exercises (
        id, user_id, title, raw_words_input, total_words, placed_words,
        width, height, grid_data, placements, clues
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      finalTitle,
      wordsText,
      layout.totalWords,
      layout.placedWords,
      layout.width,
      layout.height,
      JSON.stringify(layout.grid),
      JSON.stringify(layout.placements),
      JSON.stringify(layout.clues)
    );

    const newExercise = {
      id,
      user_id: userId,
      title: finalTitle,
      createdAt: new Date().toISOString(),
      rawWordsInput: wordsText,
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
      message: "Tạo bài tập crossword thành công!",
      exercise: newExercise
    });
  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({ error: "Lỗi server khi tạo crossword: " + err.message });
  }
});

// 2. LẤY TẤT CẢ BÀI TẬP CỦA USER ĐANG ĐĂNG NHẬP
router.get("/", optionalAuth, (req, res) => {
  try {
    const userId = getEffectiveUserId(req);
    const rows = db.prepare(`
      SELECT id, title, created_at AS createdAt, total_words AS totalWords,
             placed_words AS placedWords, (width || 'x' || height) AS gridSize
      FROM exercises
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi lấy bài tập: " + err.message });
  }
});

// 3. LẤY CHI TIẾT 1 BÀI TẬP
router.get("/:id", optionalAuth, (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM exercises WHERE id = ?").get(req.params.id);
    if (!row) {
      return res.status(404).json({ error: "Không tìm thấy bài tập này!" });
    }

    const ex = {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      createdAt: row.created_at,
      rawWordsInput: row.raw_words_input,
      totalWords: row.total_words,
      placedWords: row.placed_words,
      width: row.width,
      height: row.height,
      grid: JSON.parse(row.grid_data),
      placements: JSON.parse(row.placements),
      clues: JSON.parse(row.clues)
    };

    res.json(ex);
  } catch (err) {
    res.status(500).json({ error: "Lỗi chi tiết: " + err.message });
  }
});

// 4. ĐỔI TÊN BÀI TẬP
router.put("/:id/rename", optionalAuth, (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Tên bài tập không được để trống!" });
    }

    const result = db.prepare("UPDATE exercises SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title.trim(), req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Không tìm thấy bài tập để đổi tên!" });
    }

    res.json({ success: true, title: title.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. XOÁ 1 BÀI TẬP
router.delete("/:id", optionalAuth, (req, res) => {
  try {
    const result = db.prepare("DELETE FROM exercises WHERE id = ?").run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Không tìm thấy bài tập để xoá!" });
    }
    res.json({ success: true, message: "Đã xoá bài tập thành công!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. XOÁ NHIỀU BÀI TẬP (BATCH DELETE)
router.post("/batch-delete", optionalAuth, (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Danh sách ID cần xoá không hợp lệ!" });
    }

    const placeholders = ids.map(() => "?").join(",");
    const result = db.prepare(`DELETE FROM exercises WHERE id IN (${placeholders})`).run(...ids);

    res.json({
      success: true,
      message: `Đã xoá thành công ${result.changes} bài tập!`,
      deletedCount: result.changes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. SINH LẠI BỐ CỤC CROSSWORD NGẪU NHIÊN
router.post("/:id/regenerate-layout", optionalAuth, (req, res) => {
  try {
    const ex = db.prepare("SELECT * FROM exercises WHERE id = ?").get(req.params.id);
    if (!ex) {
      return res.status(404).json({ error: "Không tìm thấy bài tập!" });
    }

    const layout = generateCrossword(ex.raw_words_input, { allowFewer: true, attempts: 50 });
    if (!layout.success) {
      return res.status(400).json({ error: "Không thể tạo lại bố cục!" });
    }

    db.prepare(`
      UPDATE exercises SET
        width = ?, height = ?, total_words = ?, placed_words = ?,
        grid_data = ?, placements = ?, clues = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      layout.width,
      layout.height,
      layout.totalWords,
      layout.placedWords,
      JSON.stringify(layout.grid),
      JSON.stringify(layout.placements),
      JSON.stringify(layout.clues),
      ex.id
    );

    const updated = {
      id: ex.id,
      userId: ex.user_id,
      title: ex.title,
      createdAt: ex.created_at,
      rawWordsInput: ex.raw_words_input,
      totalWords: layout.totalWords,
      placedWords: layout.placedWords,
      width: layout.width,
      height: layout.height,
      grid: layout.grid,
      placements: layout.placements,
      clues: layout.clues
    };

    res.json({
      success: true,
      message: "Đã sinh bố cục crossword mới ngẫu nhiên!",
      exercise: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;