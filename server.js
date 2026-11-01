const express = require('express');
const fs = require('fs');
const path = require('path');
const { generateCrossword, parseWordList } = require('./generator');

const app = express();
const PORT = process.env.PORT || 3000;
// Hỗ trợ cả chạy cục bộ (local) và Railway Persistent Volume qua biến môi trường DATA_DIR
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DATA_FILE = path.join(DATA_DIR, 'exercises.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data folder and file exists
function loadExercises() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify([]), 'utf8');
      return [];
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading exercises:', err);
    return [];
  }
}

function saveExercises(exercises) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(exercises, null, 2), 'utf8');
}

// Format default title as DD/MM/YYYY
function getDefaultTitle() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

// API: Generate & Save Crossword Exercise
app.post('/api/exercises/generate', (req, res) => {
  try {
    const { wordsText, title } = req.body;
    if (!wordsText || typeof wordsText !== 'string') {
      return res.status(400).json({ error: 'Vui lòng cung cấp danh sách từ vựng!' });
    }

    const parsed = parseWordList(wordsText);
    if (parsed.length < 15) {
      return res.status(400).json({
        error: `Bạn đã nhập ${parsed.length} từ hợp lệ. Cần tối thiểu 15 từ vựng để tạo bài tập crossword!`
      });
    }

    const layout = generateCrossword(wordsText);
    if (!layout.success) {
      return res.status(400).json({ error: layout.error || 'Không thể tạo crossword từ các từ đã nhập!' });
    }

    const finalTitle = (title && title.trim()) ? title.trim() : getDefaultTitle();
    const id = Date.now().toString();

    const newExercise = {
      id,
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

    const exercises = loadExercises();
    exercises.unshift(newExercise); // Prepend latest
    saveExercises(exercises);

    return res.json({
      success: true,
      message: 'Tạo bài tập crossword thành công!',
      exercise: newExercise
    });
  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: 'Lỗi server khi tạo crossword: ' + err.message });
  }
});

// API: Get all saved exercises (summary list)
app.get('/api/exercises', (req, res) => {
  const exercises = loadExercises();
  const summary = exercises.map(ex => ({
    id: ex.id,
    title: ex.title,
    createdAt: ex.createdAt,
    totalWords: ex.totalWords,
    placedWords: ex.placedWords,
    gridSize: `${ex.width}x${ex.height}`
  }));
  res.json(summary);
});

// API: Get specific exercise detail
app.get('/api/exercises/:id', (req, res) => {
  const exercises = loadExercises();
  const found = exercises.find(ex => ex.id === req.params.id);
  if (!found) {
    return res.status(404).json({ error: 'Không tìm thấy bài tập này!' });
  }
  res.json(found);
});

// API: Update exercise title (rename)
app.put('/api/exercises/:id/rename', (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Tên bài tập không được để trống!' });
  }
  const exercises = loadExercises();
  const ex = exercises.find(e => e.id === req.params.id);
  if (!ex) {
    return res.status(404).json({ error: 'Không tìm thấy bài tập!' });
  }
  ex.title = title.trim();
  saveExercises(exercises);
  res.json({ success: true, title: ex.title });
});

// API: Delete exercise

// API: Batch delete exercises
app.post('/api/exercises/batch-delete', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Danh sách ID cần xoá không hợp lệ!' });
    }

    let exercises = loadExercises();
    const beforeCount = exercises.length;
    const idSet = new Set(ids);
    exercises = exercises.filter(e => !idSet.has(e.id));
    const deletedCount = beforeCount - exercises.length;

    saveExercises(exercises);
    res.json({ success: true, message: `Đã xoá thành công ${deletedCount} bài tập!`, deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/exercises/:id', (req, res) => {
  let exercises = loadExercises();
  const initialLen = exercises.length;
  exercises = exercises.filter(e => e.id !== req.params.id);
  if (exercises.length === initialLen) {
    return res.status(404).json({ error: 'Không tìm thấy bài tập để xoá!' });
  }
  saveExercises(exercises);
  res.json({ success: true, message: 'Đã xoá bài tập thành công!' });
});


// API: Re-generate crossword layout dynamically (đổi bố cục ngẫu nhiên mỗi lần reload / ôn tập)
app.post('/api/exercises/:id/regenerate-layout', (req, res) => {
  try {
    const exercises = loadExercises();
    const ex = exercises.find(e => e.id === req.params.id);
    if (!ex) {
      return res.status(404).json({ error: 'Không tìm thấy bài tập!' });
    }

    // Sinh layout crossword mới toanh từ danh sách từ vựng gốc
    const layout = generateCrossword(ex.rawWordsInput, { allowFewer: true, attempts: 50 });
    if (!layout.success) {
      return res.status(400).json({ error: 'Không thể tạo lại bố cục!' });
    }

    // Cập nhật lại layout mới cho bài tập
    ex.width = layout.width;
    ex.height = layout.height;
    ex.grid = layout.grid;
    ex.placements = layout.placements;
    ex.clues = layout.clues;
    ex.placedWords = layout.placedWords;

    saveExercises(exercises);

    res.json({
      success: true,
      message: 'Đã sinh bố cục crossword mới ngẫu nhiên!',
      exercise: ex
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Crossword Learning Server running at http://localhost:${PORT}`);
});
