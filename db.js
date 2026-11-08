// db.js - Database initialization and schema management
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "crossword.db");
const db = new Database(DB_PATH);

// Enable foreign keys & WAL mode for high concurrency
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      full_name TEXT NOT NULL,
      avatar_url TEXT,
      auth_provider TEXT DEFAULT "local",
      provider_id TEXT,
      is_verified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      device_info TEXT,
      expires_at DATETIME NOT NULL,
      is_revoked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      reset_token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      is_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vocabulary_templates (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      raw_words_text TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      badge TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      template_id TEXT,
      title TEXT NOT NULL,
      raw_words_input TEXT NOT NULL,
      total_words INTEGER NOT NULL,
      placed_words INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      grid_data TEXT NOT NULL,
      placements TEXT NOT NULL,
      clues TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES vocabulary_templates(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS user_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      completed_words TEXT DEFAULT "[]",
      current_answers TEXT DEFAULT "{}",
      is_completed INTEGER DEFAULT 0,
      last_played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
      UNIQUE(user_id, exercise_id)
    );
  `);

  seedDefaultTemplates();
  migrateOldExercisesIfAny();
}

function seedDefaultTemplates() {
  const count = db.prepare("SELECT COUNT(*) AS total FROM vocabulary_templates").get().total;
  if (count > 0) return;

  const templates = [
    {
      id: "tpl-toeic-contracts",
      category: "TOEIC",
      title: "TOEIC 600 - Unit 1: Hợp Đồng & Thương Thảo (Contracts)",
      description: "Bộ từ vựng chủ đạo trong bài thi TOEIC Part 5, 6, 7 về điều khoản hợp đồng thương mại.",
      badge: "HOT TOEIC",
      words: [
        "agreement : (n) hợp đồng, sự thỏa thuận",
        "assurance : (n) sự cam đoan, sự bảo đảm",
        "cancellation : (n) sự hủy bỏ, chấm dứt hợp đồng",
        "determine : (v) quyết định, xác định rõ",
        "engage : (v) tham gia vào, thuê nhân sự",
        "establish : (v) thiết lập, gây dựng cơ sở",
        "obligate : (v) bắt buộc, có nghĩa vụ tuân thủ",
        "party : (n) bên tham gia hợp đồng",
        "provision : (n) điều khoản quy định",
        "resolve : (v) giải quyết tranh chấp",
        "specific : (adj) cụ thể, chi tiết rõ ràng",
        "negotiate : (v) đàm phán, thương lượng",
        "signature : (n) chữ ký xác nhận",
        "clause : (n) điều khoản trong văn bản",
        "binding : (adj) có tính ràng buộc pháp lý",
        "amendment : (n) sự sửa đổi, bổ sung hợp đồng",
        "comply : (v) tuân thủ theo quy định",
        "breach : (n) vi phạm cam kết hợp đồng",
        "compensation : (n) tiền bồi thường thiệt hại",
        "validity : (n) hiệu lực pháp lý"
      ]
    },
    {
      id: "tpl-toeic-office",
      category: "TOEIC",
      title: "TOEIC 600 - Unit 2: Công Sở & Điều Hành (Office & Corporate)",
      description: "Các thuật ngữ giao tiếp công việc, thư từ, phòng ban và quản lý nhân sự.",
      badge: "TOEIC CĂN BẢN",
      words: [
        "colleague : (n) đồng nghiệp cùng cơ quan",
        "conference : (n) hội thảo, hội nghị lớn",
        "department : (n) phòng ban làm việc",
        "equipment : (n) thiết bị văn phòng",
        "headquarters : (n) trụ sở chính công ty",
        "implement : (v) triển khai, thực thi kế hoạch",
        "manager : (n) người quản lý điều hành",
        "memo : (n) thông báo nội bộ",
        "notify : (v) gửi thông báo chính thức",
        "procedure : (n) quy trình làm việc",
        "productivity : (n) năng suất công việc",
        "schedule : (n) lịch trình thời gian",
        "supervisor : (n) người giám sát trực tiếp",
        "workplace : (n) môi trường làm việc",
        "collaborate : (v) hợp tác làm việc nhóm",
        "deadline : (n) hạn chót nộp bài hoặc dự án",
        "facility : (n) cơ sở vật chất kỹ thuật",
        "initiative : (n) sáng kiến đổi mới",
        "delegate : (v) giao phó, ủy thác công việc",
        "feedback : (n) ý kiến phản hồi đánh giá"
      ]
    },
    {
      id: "tpl-ielts-academic-a",
      category: "IELTS",
      title: "IELTS Core - Danh Sách Từ Vựng Học Thuật Chữ A",
      description: "20 từ vựng học thuật quan trọng bậc nhất cho bài thi Reading & Writing IELTS.",
      badge: "IELTS 6.5+",
      words: [
        "abandon : (v) từ bỏ, bỏ rơi hoàn toàn",
        "ability : (n) khả năng, năng lực",
        "abstract : (adj) trừu tượng, mang tính lý thuyết",
        "academic : (adj) thuộc về học thuật nghiên cứu",
        "accelerate : (v) tăng tốc, thúc đẩy tiến độ",
        "accent : (n) giọng điệu phát âm vùng miền",
        "accept : (v) chấp nhận, thừa nhận sự thật",
        "access : (n) quyền truy cập, lối vào",
        "accident : (n) tai nạn ngoài ý muốn",
        "accompany : (v) đồng hành, đi kèm cùng",
        "accomplish : (v) hoàn thành xuất sắc mục tiêu",
        "accountant : (n) kế toán viên chuyên nghiệp",
        "accurate : (adj) chính xác, chuẩn xác tuyệt đối",
        "accuse : (v) cáo buộc, buộc tội",
        "achieve : (v) gặt hái thành tựu, đạt được",
        "acknowledge : (v) công nhận, thừa nhận đóng góp",
        "acquire : (v) tiếp thu, lĩnh hội kiến thức",
        "activity : (n) hoạt động thể chất hoặc xã hội",
        "adapt : (v) thích nghi với môi trường mới",
        "advantage : (n) ưu thế, lợi thế cạnh tranh"
      ]
    },
    {
      id: "tpl-daily-phrasal-verbs",
      category: "GIAOTIEP",
      title: "Từ Ghép & Cụm Phổ Biến Trong Đời Sống (Phrasal & Compounds)",
      description: "Rèn luyện từ vựng ghép có dấu cách và dấu gạch nối thường gặp.",
      badge: "GIAO TIẾP",
      words: [
        "post office : (n) bưu điện gửi thư",
        "part-time : (adj) làm việc bán thời gian",
        "full-time : (adj) làm việc toàn thời gian",
        "high school : (n) trường trung học phổ thông",
        "ice cream : (n) món kem lạnh tráng miệng",
        "bus stop : (n) điểm dừng xe buýt",
        "swimming pool : (n) hồ bơi giải trí",
        "living room : (n) phòng khách trong gia đình",
        "credit card : (n) thẻ thanh toán tín dụng",
        "well-known : (adj) nổi tiếng, được nhiều người biết",
        "check-in : (n) quầy làm thủ tục sân bay",
        "warm-up : (n) bài tập khởi động",
        "passer-by : (n) người qua đường",
        "brother-in-law : (n) anh rể hoặc em rể",
        "fire fighter : (n) lính cứu hỏa dũng cảm",
        "up-to-date : (adj) cập nhật xu hướng mới nhất",
        "dining room : (n) phòng ăn gia đình",
        "make-up : (n) đồ trang điểm mỹ phẩm",
        "take-off : (n) sự cất cánh của máy bay",
        "first-aid : (n) sơ cứu y tế ban đầu"
      ]
    }
  ];

  const insert = db.prepare(`
    INSERT INTO vocabulary_templates (id, category, title, description, raw_words_text, word_count, badge)
    VALUES (@id, @category, @title, @description, @raw_words_text, @word_count, @badge)
  `);

  for (const t of templates) {
    insert.run({
      id: t.id,
      category: t.category,
      title: t.title,
      description: t.description,
      raw_words_text: t.words.join("\n"),
      word_count: t.words.length,
      badge: t.badge
    });
  }
}

function migrateOldExercisesIfAny() {
  try {
    const jsonPath = path.join(DATA_DIR, "exercises.json");
    if (!fs.existsSync(jsonPath)) return;

    // Check if we need a default demo user for existing exercises
    let defaultUser = db.prepare("SELECT * FROM users WHERE email = ?").get("demo@crossword.local");
    if (!defaultUser) {
      const demoId = "user-default-demo";
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name, auth_provider, is_verified)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(demoId, "demo@crossword.local", null, "Người dùng Demo", "local");
      defaultUser = { id: demoId };
    }

    const raw = fs.readFileSync(jsonPath, "utf8");
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return;

    const checkStmt = db.prepare("SELECT id FROM exercises WHERE id = ?");
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO exercises (
        id, user_id, title, raw_words_input, total_words, placed_words,
        width, height, grid_data, placements, clues, created_at
      ) VALUES (
        @id, @user_id, @title, @raw_words_input, @total_words, @placed_words,
        @width, @height, @grid_data, @placements, @clues, @created_at
      )
    `);

    for (const ex of list) {
      if (checkStmt.get(ex.id)) continue;
      insertStmt.run({
        id: ex.id,
        user_id: defaultUser.id,
        title: ex.title || "Bài tập",
        raw_words_input: ex.rawWordsInput || "",
        total_words: ex.totalWords || 0,
        placed_words: ex.placedWords || 0,
        width: ex.width || 20,
        height: ex.height || 20,
        grid_data: JSON.stringify(ex.grid || []),
        placements: JSON.stringify(ex.placements || []),
        clues: JSON.stringify(ex.clues || {}),
        created_at: ex.createdAt || new Date().toISOString()
      });
    }
  } catch (err) {
    console.error("Migration error:", err);
  }
}

module.exports = {
  db,
  initDatabase
};