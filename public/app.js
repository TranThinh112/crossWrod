// Chuyển sang từ kế tiếp hoặc từ phía trên theo danh sách hiển thị cột bên phải
function navigateClueWord(delta) {
  if (!currentExercise || !currentExercise.clues) return;
  // Lấy danh sách các clue theo thứ tự hiển thị của cột hiện tại
  const currentDir = currentActiveWord ? currentActiveWord.direction : 'across';
  const list = currentDir === 'across' ? currentExercise.clues.across : currentExercise.clues.down;
  if (!list || list.length === 0) return;

  let currentIndex = list.findIndex(p => p.id === (currentActiveWord ? currentActiveWord.id : -1));
  let nextIndex = currentIndex + delta;

  if (nextIndex < 0) {
    // Nếu đang ở đầu danh sách Across và ấn Mũi tên Lên => giữ nguyên hoặc nhảy đến từ cuối
    nextIndex = list.length - 1;
  } else if (nextIndex >= list.length) {
    // Nếu đang ở cuối danh sách Across và ấn Mũi tên Xuống => sang từ đầu danh sách Down hoặc vòng lại
    if (currentDir === 'across' && currentExercise.clues.down.length > 0) {
      focusWordSmart(currentExercise.clues.down[0]);
      return;
    } else {
      nextIndex = 0;
    }
  }

  const nextWord = list[nextIndex];
  if (nextWord) {
    focusWordSmart(nextWord);
  }
}

// Kiểm tra xem ô (r, c) có thuộc một từ đã được giải ĐÚNG 100% hay không
function isCellInCompletedWord(r, c) {
  if (!currentExercise || !currentExercise.placements) return false;
  return currentExercise.placements.some(p => {
    if (!isCovered(p, r, c)) return false;
    const dx = p.direction === 'across' ? 1 : 0;
    const dy = p.direction === 'across' ? 0 : 1;
    for (let k = 0; k < p.cleanWord.length; k++) {
      const cr = p.y + k * dy;
      const cc = p.x + k * dx;
      const expected = p.cleanWord[k].toUpperCase();
      if (expected === '-' || expected === ' ') continue;
      const inp = getCellInput(cr, cc);
      if (!inp || inp.value.trim().toUpperCase() !== expected) return false;
    }
    return true;
  });
}

// Lưu và khôi phục tiến trình làm bài vào localStorage
function saveUserProgress() {
  if (!currentExercise || !currentExercise.id) return;
  const inputs = document.querySelectorAll('input.cell-input:not(.symbol-input)');
  const state = {};
  inputs.forEach(inp => {
    const r = inp.dataset.row;
    const c = inp.dataset.col;
    const val = inp.value.trim().toUpperCase();
    if (val) state['' + r + '_' + c] = val;
  });
  localStorage.setItem('crossword_progress_' + currentExercise.id, JSON.stringify(state));
}

function restoreUserProgress() {
  if (!currentExercise || !currentExercise.id) return;
  const raw = localStorage.getItem('crossword_progress_' + currentExercise.id);
  if (!raw) return;
  try {
    const state = JSON.parse(raw);
    let hasRestored = false;
    Object.keys(state).forEach(key => {
      const [r, c] = key.split('_');
      const inp = getCellInput(r, c);
      if (inp && inp.dataset.isSymbol !== 'true') {
        inp.value = state[key];
        hasRestored = true;
      }
    });
    if (hasRestored) {
      syncAllWordsToClues();
      // Kiểm tra và bật nền xanh nếu từ hoàn thành đúng
      if (currentExercise.placements) {
        currentExercise.placements.forEach(p => {
          checkAndHandleCompletedWord(p.y, p.x);
        });
      }
    }
  } catch (err) {
    console.error('Error restoring progress:', err);
  }
}

function clearUserProgress() {
  if (!currentExercise || !currentExercise.id) return;
  localStorage.removeItem('crossword_progress_' + currentExercise.id);
}

let btnReshuffleLayout = null;
// Cập nhật trạng thái khóa/mở khóa nút đổi bố cục theo yêu cầu người dùng
let isCheckSolutionClicked = false;

function updateReshuffleButtonState() {
  saveUserProgress();
  const btn = document.getElementById('btnReshuffleLayout');
  if (!btn || !currentExercise || !currentExercise.placements) return;

  // 1. Nếu đã click kiểm tra bài làm => luôn mở khóa
  if (isCheckSolutionClicked) {
    btn.disabled = false;
    btn.classList.remove('is-locked');
    btn.title = 'Xáo trộn và sinh bố cục ô chữ mới';
    return;
  }

  // 2. Kiểm tra xem ô cờ có bất kỳ chữ nào được nhập hay không
  const allInputs = document.querySelectorAll('input.cell-input:not(.symbol-input)');
  let hasAnyInputTyped = false;
  allInputs.forEach(inp => {
    if (inp.value && inp.value.trim() !== '') {
      hasAnyInputTyped = true;
    }
  });

  // Nếu CHƯA NHẬP GÌ (bàn cờ trống) => LUÔN MỞ KHÓA
  if (!hasAnyInputTyped) {
    btn.disabled = false;
    btn.classList.remove('is-locked');
    btn.title = 'Xáo trộn và sinh bố cục ô chữ mới';
    return;
  }

  const placements = currentExercise.placements;
  let totalWords = placements.length;
  let correctWordCount = 0;
  // Đếm số từ đã đúng hoàn toàn
  placements.forEach(p => {
    const dx = p.direction === 'across' ? 1 : 0;
    const dy = p.direction === 'across' ? 0 : 1;
    let isFullWordCorrect = true;
    for (let k = 0; k < p.cleanWord.length; k++) {
      const cr = p.y + k * dy;
      const cc = p.x + k * dx;
      const expected = p.cleanWord[k].toUpperCase();
      if (expected === '-' || expected === ' ') continue;
      const inp = getCellInput(cr, cc);
      if (!inp || inp.value.trim().toUpperCase() !== expected) {
        isFullWordCorrect = false;
        break;
      }
    }
    if (isFullWordCorrect) correctWordCount++;
  });

  // Điều kiện cho phép click: Chưa có từ nào nhập (chưa nhập chữ nào) HOẶC Đã nhập toàn bộ và đúng 100%
  const isBoardEmpty = !hasAnyInputTyped;
  const isAllWordsCompleted = (correctWordCount === totalWords && totalWords > 0);

  if (isBoardEmpty || isAllWordsCompleted) {
    btn.disabled = false;
    btn.classList.remove('is-locked');
    btn.title = 'Xáo trộn và sinh bố cục ô chữ mới';
  } else if (correctWordCount >= 1) {
    // Nếu đã có 1 từ đúng trở lên mà chưa hoàn thành 100% và chưa bấm kiểm tra bài làm => KHÓA
    btn.disabled = true;
    btn.classList.add('is-locked');
    btn.title = 'Nút bị khóa khi đang có từ giải đúng dở dang. Hãy giải hết hoặc bấm Kiểm tra bài làm để mở lại.';
  } else {
    // Chưa có từ nào đúng nhưng đã gõ linh tinh, vẫn giữ trạng thái bình thường
    btn.disabled = false;
    btn.classList.remove('is-locked');
  }
}

// app.js - Full Interactive Crossword Learning System with Popup Dialogs (Zero native alert/confirm)

const sample20WordsA = `abandon : từ bỏ, bỏ rơi
ability : khả năng, năng lực
abstract : trừu tượng
academic : tính chất học thuật
accelerate : tăng tốc, thúc đẩy
accent : giọng điệu phát âm
accept : chấp nhận, thừa nhận
access : quyền truy cập, lối vào
accident : tai nạn ngoài ý muốn
accompany : đồng hành, đi cùng
accomplish : hoàn thành xuất sắc
accountant : kế toán viên
accurate : chính xác, chuẩn xác
accuse : buộc tội, cáo buộc
achieve : đạt được thành tựu
acknowledge : công nhận, thừa nhận
acquire : tiếp thu, thu nhận
activity : hoạt động
adapt : thích nghi, làm thích hợp
advantage : lợi thế, ưu thế`;

// State
let currentExercise = null;
let currentDirection = 'across'; // 'across' or 'down'
let selectedCell = { r: 0, c: 0 };
let currentActiveWord = null;
let isWordSelected = false;
// State: Quản lý chế độ Chọn nhiều bài tập để xoá
let isSelectMode = false;
let selectedExerciseIds = new Set();
 // Trạng thái Ctrl+A đang bôi đen toàn bộ từ

// DOM Elements
const inputModal = document.getElementById('inputModal');
const btnOpenModal = document.getElementById('btnOpenModal');
const btnOpenModalWelcome = document.getElementById('btnOpenModalWelcome');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelModal = document.getElementById('btnCancelModal');

const vocabularyInput = document.getElementById('vocabularyInput');
const exerciseTitleInput = document.getElementById('exerciseTitleInput');
const wordCounter = document.getElementById('wordCounter');
const btnGenerate = document.getElementById('btnGenerate');
const btnClearInput = document.getElementById('btnClearInput');
const btnQuickFill = document.getElementById('btnQuickFill');

const puzzleSection = document.getElementById('puzzleSection');
const noExerciseState = document.getElementById('noExerciseState');
const exerciseList = document.getElementById('exerciseList');
const exerciseCountBadge = document.getElementById('exerciseCountBadge');

const currentExerciseTitle = document.getElementById('currentExerciseTitle');
const titleViewMode = document.getElementById('titleViewMode');
const titleEditMode = document.getElementById('titleEditMode');
const editTitleInput = document.getElementById('editTitleInput');
const btnEditTitle = document.getElementById('btnEditTitle');
const btnSaveTitle = document.getElementById('btnSaveTitle');
const btnCancelTitle = document.getElementById('btnCancelTitle');

const puzzleCreatedTime = document.getElementById('puzzleCreatedTime');
const puzzlePlacedStats = document.getElementById('puzzlePlacedStats');
const puzzleDimensions = document.getElementById('puzzleDimensions');

const crosswordGrid = document.getElementById('crosswordGrid');
const acrossCluesList = document.getElementById('acrossCluesList');
const downCluesList = document.getElementById('downCluesList');

// (moved to top)
const btnCheckSolution = document.getElementById('btnCheckSolution');
const btnRevealAll = document.getElementById('btnRevealAll');
const btnClearAnswers = document.getElementById('btnClearAnswers');
const btnPrint = document.getElementById('btnPrint');
const toastEl = document.getElementById('toast');

// Notice / Confirm Popup DOM
const noticeModal = document.getElementById('noticeModal');
const noticeIcon = document.getElementById('noticeIcon');
const noticeTitle = document.getElementById('noticeTitle');
const noticeMessage = document.getElementById('noticeMessage');
const btnCloseNotice = document.getElementById('btnCloseNotice');
const btnNoticeConfirm = document.getElementById('btnNoticeConfirm');
const btnNoticeCancel = document.getElementById('btnNoticeCancel');

let noticeResolver = null;

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  setDefaultTitle();
  loadExercisesList();
  bindEvents();
  updateWordCount();
});

// Custom Popup Alert & Confirm to replace native window.alert / window.confirm
function showPopupAlert(message, title = 'Thông báo', type = 'info') {
  return new Promise((resolve) => {
    noticeResolver = resolve;
    noticeTitle.textContent = title;
    noticeMessage.textContent = message;

    if (type === 'error') {
      noticeIcon.textContent = '⚠️';
      btnNoticeConfirm.className = 'btn btn-danger';
    } else if (type === 'success') {
      noticeIcon.textContent = '🎉';
      btnNoticeConfirm.className = 'btn btn-success';
    } else {
      noticeIcon.textContent = '💡';
      btnNoticeConfirm.className = 'btn btn-primary';
    }

    btnNoticeConfirm.textContent = 'Đã hiểu';
    btnNoticeCancel.style.display = 'none';
    noticeModal.style.display = 'flex';
    btnNoticeConfirm.focus();
  });
}

function showPopupConfirm(message, title = 'Xác nhận', confirmBtnText = 'Đồng ý', isDanger = false) {
  return new Promise((resolve) => {
    noticeResolver = resolve;
    noticeTitle.textContent = title;
    noticeMessage.textContent = message;
    noticeIcon.textContent = isDanger ? '❓' : '💡';

    btnNoticeConfirm.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';
    btnNoticeConfirm.textContent = confirmBtnText;
    btnNoticeCancel.style.display = 'inline-flex';
    noticeModal.style.display = 'flex';
    btnNoticeConfirm.focus();
  });
}

function closeNoticePopup(result) {
  noticeModal.style.display = 'none';
  if (noticeResolver) {
    const res = noticeResolver;
    noticeResolver = null;
    res(result);
  }
}

// Override native window.alert & window.confirm just in case any third-party script triggers them
window.alert = function (msg) {
  showPopupAlert(msg);
};
window.confirm = function (msg) {
  return showPopupConfirm(msg);
};

function setDefaultTitle() {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  exerciseTitleInput.value = `${d}/${m}/${y}`;
}

// Modal open/close controls
function openModal() {
  inputModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  if (!exerciseTitleInput.value) setDefaultTitle();
  vocabularyInput.focus();
}

function closeModal() {
  inputModal.style.display = 'none';
  document.body.style.overflow = '';
}

function bindEvents() {
  btnReshuffleLayout = document.getElementById('btnReshuffleLayout');
  // Notice modal events
  btnCloseNotice.addEventListener('click', () => closeNoticePopup(false));
  btnNoticeCancel.addEventListener('click', () => closeNoticePopup(false));
  btnNoticeConfirm.addEventListener('click', () => closeNoticePopup(true));

  // Modal buttons
  btnOpenModal.addEventListener('click', openModal);
  if (btnOpenModalWelcome) btnOpenModalWelcome.addEventListener('click', openModal);
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);

  // Close modals when click outside dialog
  inputModal.addEventListener('click', (e) => {
    if (e.target === inputModal) closeModal();
  });

  noticeModal.addEventListener('click', (e) => {
    if (e.target === noticeModal) closeNoticePopup(false);
  });

  // ESC to close modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (noticeModal.style.display === 'flex') {
        closeNoticePopup(false);
      } else if (inputModal.style.display === 'flex') {
        closeModal();
      }
    }
  });

  // Input live count
  vocabularyInput.addEventListener('input', updateWordCount);

  // Quick fill sample words
  btnQuickFill.addEventListener('click', () => {
    vocabularyInput.value = sample20WordsA.trim();
    setDefaultTitle();
    updateWordCount();
    showToast('Đã nạp 20 từ vựng chữ A mẫu!', 'success');
  });

  // Clear input
  btnClearInput.addEventListener('click', () => {
    vocabularyInput.value = '';
    updateWordCount();
  });

  // Generate button
  btnGenerate.addEventListener('click', handleGenerate);

  // Rename actions
  btnEditTitle.addEventListener('click', () => {
    editTitleInput.value = currentExercise.title;
    titleViewMode.style.display = 'none';
    titleEditMode.style.display = 'flex';
    editTitleInput.focus();
  });

  btnCancelTitle.addEventListener('click', () => {
    titleEditMode.style.display = 'none';
    titleViewMode.style.display = 'flex';
  });

  btnSaveTitle.addEventListener('click', handleRename);

  // Puzzle Actions
  if (btnReshuffleLayout) btnReshuffleLayout.addEventListener('click', handleReshuffleLayout);
  btnCheckSolution.addEventListener('click', handleCheckSolution);
  btnRevealAll.addEventListener('click', handleRevealAll);
  btnClearAnswers.addEventListener('click', handleClearAnswers);
  btnPrint.addEventListener('click', () => window.print());

  // Chế độ Chọn nhiều bài tập (Batch Select Mode)
  const btnToggleSelectMode = document.getElementById('btnToggleSelectMode');
  if (btnToggleSelectMode) {
    btnToggleSelectMode.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSelectMode();
    };
  }

  const btnCancelSelectMode = document.getElementById('btnCancelSelectMode');
  if (btnCancelSelectMode) btnCancelSelectMode.addEventListener('click', () => toggleSelectMode(false));

  const chkSelectAll = document.getElementById('chkSelectAll');
  if (chkSelectAll) {
    chkSelectAll.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('.exercise-checkbox').forEach(chk => {
        chk.checked = isChecked;
        const id = chk.dataset.id;
        const item = chk.closest('.exercise-item');
        if (isChecked) {
          selectedExerciseIds.add(id);
          if (item) item.classList.add('is-selected-for-delete');
        } else {
          selectedExerciseIds.delete(id);
          if (item) item.classList.remove('is-selected-for-delete');
        }
      });
      updateBatchActionBarUI();
    });
  }

  const btnDeleteSelected = document.getElementById('btnDeleteSelected');
  if (btnDeleteSelected) btnDeleteSelected.addEventListener('click', handleBatchDelete);

}

function showToast(message, type = 'info') {
  toastEl.textContent = message;
  toastEl.className = 'toast show';
  if (type === 'error') toastEl.classList.add('toast-error');
  if (type === 'success') toastEl.classList.add('toast-success');

  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3200);
}

function countValidWords(text) {
  if (!text) return 0;
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    let word = line.split(/[:\t]|\s-\s/)[0].trim();
    const clean = word.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length >= 2) seen.add(clean);
  }
  return seen.size;
}

function updateWordCount() {
  const count = countValidWords(vocabularyInput.value);
  wordCounter.innerHTML = `Đã phát hiện: <strong>${count}</strong>/15 từ`;
  if (count >= 15) {
    wordCounter.className = 'word-counter valid';
  } else {
    wordCounter.className = 'word-counter invalid';
  }
}

// Generate Exercise Request
async function handleGenerate() {
  const text = vocabularyInput.value.trim();
  const title = exerciseTitleInput.value.trim();
  const count = countValidWords(text);

  if (count < 15) {
    await showPopupAlert(`Bạn hiện chỉ có ${count} từ vựng hợp lệ. Vui lòng nhập tối thiểu 15 từ vựng để tạo bài tập crossword!`, 'Chưa đủ số lượng từ', 'error');
    return;
  }

  btnGenerate.disabled = true;
  btnGenerate.textContent = '⏳ Đang tính toán & sinh crossword...';

  try {
    const res = await fetch('/api/exercises/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wordsText: text, title })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Lỗi khi tạo crossword');
    }

    closeModal();
    showToast('Tạo bài tập crossword thành công!', 'success');
    renderExercise(data.exercise);
    loadExercisesList(data.exercise.id);

    puzzleSection.style.display = 'block';
    if (noExerciseState) noExerciseState.style.display = 'none';
    puzzleSection.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    showPopupAlert(err.message, 'Lỗi sinh ô chữ', 'error');
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.textContent = '✨ Sinh bài tập Crossword ngay';
  }
}


window.toggleSelectMode = toggleSelectMode;
function toggleSelectMode(forceState = null) {
  isSelectMode = forceState !== null ? forceState : !isSelectMode;
  selectedExerciseIds.clear();

  const toolbar = document.getElementById('batchActionToolbar');
  const btnToggle = document.getElementById('btnToggleSelectMode');
  const chkAll = document.getElementById('chkSelectAll');

  if (toolbar) toolbar.style.display = isSelectMode ? 'flex' : 'none';
  if (btnToggle) {
    btnToggle.textContent = isSelectMode ? 'Hủy chọn' : '☑️ Chọn';
    btnToggle.className = isSelectMode ? 'btn btn-sm btn-danger select-mode-btn' : 'btn btn-sm btn-outline select-mode-btn';
  }
  if (chkAll) chkAll.checked = false;

  updateBatchActionBarUI();
  // Render lại checkbox trên danh sách bài tập
  updateExerciseListCheckboxes();
}

function updateBatchActionBarUI() {
  const count = selectedExerciseIds.size;
  const countTag = document.getElementById('selectedCountText');
  const deleteBtn = document.getElementById('btnDeleteSelected');
  const deleteBadge = document.getElementById('deleteCountBadge');

  if (countTag) countTag.textContent = `Đã chọn: ${count}`;
  if (deleteBadge) deleteBadge.textContent = count;
  if (deleteBtn) deleteBtn.disabled = count === 0;

  // Cập nhật trạng thái checkbox Chọn tất cả
  const allCheckboxes = document.querySelectorAll('.exercise-checkbox');
  const chkAll = document.getElementById('chkSelectAll');
  if (chkAll && allCheckboxes.length > 0) {
    chkAll.checked = count === allCheckboxes.length;
  }
}

function updateExerciseListCheckboxes() {
  document.querySelectorAll('.exercise-item').forEach(item => {
    const id = item.dataset.id;
    let chkWrap = item.querySelector('.exercise-checkbox-wrap');

    if (isSelectMode) {
      if (!chkWrap) {
        chkWrap = document.createElement('div');
        chkWrap.className = 'exercise-checkbox-wrap';
        chkWrap.innerHTML = `<input type="checkbox" class="exercise-checkbox" data-id="${id}">`;
        item.insertBefore(chkWrap, item.firstChild);

        const chk = chkWrap.querySelector('input');
        chk.addEventListener('click', (e) => e.stopPropagation());
        chk.addEventListener('change', (e) => {
          if (e.target.checked) {
            selectedExerciseIds.add(id);
            item.classList.add('is-selected-for-delete');
          } else {
            selectedExerciseIds.delete(id);
            item.classList.remove('is-selected-for-delete');
          }
          updateBatchActionBarUI();
        });
      }
      chkWrap.style.display = 'flex';
      const chk = chkWrap.querySelector('input');
      chk.checked = selectedExerciseIds.has(id);
      item.classList.toggle('is-selected-for-delete', chk.checked);
    } else {
      if (chkWrap) chkWrap.style.display = 'none';
      item.classList.remove('is-selected-for-delete');
    }
  });
}

async function handleBatchDelete() {

  const count = selectedExerciseIds.size;
  if (count === 0) return;

  const confirmed = await showPopupConfirm(
    `Bạn có chắc chắn muốn xoá ${count} bài tập đã chọn không? Thao tác này sẽ xoá vĩnh viễn các bài tập này.`,
    'Xác nhận xoá nhiều bài tập',
    `Xoá ngay (${count})`,
    true
  );
  if (!confirmed) return;

  try {
    const ids = Array.from(selectedExerciseIds);
    const res = await fetch('/api/exercises/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi khi xoá hàng loạt');

    showToast(data.message || `Đã xoá ${count} bài tập!`, 'info');

    // Nếu bài tập đang mở nằm trong danh sách bị xoá => reset view
    if (currentExercise && selectedExerciseIds.has(currentExercise.id)) {
      currentExercise = null;
      puzzleSection.style.display = 'none';
    }

    toggleSelectMode(false);
    loadExercisesList();
  } catch (err) {
    showPopupAlert('Không thể xoá: ' + err.message, 'Lỗi', 'error');
  }
}

// Load List of Exercises
async function loadExercisesList(activeId = null) {
  try {
    const res = await fetch('/api/exercises');
    const list = await res.json();
    exerciseCountBadge.textContent = list.length;

    if (list.length === 0) {
      exerciseList.innerHTML = '<div class="empty-state">Chưa có bài tập nào. Hãy tạo bài tập đầu tiên của bạn!</div>';
      puzzleSection.style.display = 'none';
      if (noExerciseState) noExerciseState.style.display = 'block';
      return;
    }

    exerciseList.innerHTML = '';
    list.forEach(ex => {
      const item = document.createElement('div');
      item.className = 'exercise-item' + (activeId && ex.id === activeId ? ' active' : '');
      item.dataset.id = ex.id;

      const dateStr = new Date(ex.createdAt).toLocaleDateString('vi-VN', {
        hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
      });

      item.innerHTML = `
        <div class="ex-item-header">
          <span class="ex-item-title">${escapeHtml(ex.title)}</span>
          <div class="ex-item-actions">
            <button class="ex-del-btn" title="Xoá bài tập này" onclick="deleteExercise(event, '${ex.id}')">🗑️</button>
          </div>
        </div>
        <div class="ex-item-meta">
          <span>🎯 ${ex.placedWords} từ</span>
          <span>📐 ${ex.gridSize}</span>
          <span>🕒 ${dateStr}</span>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.ex-del-btn')) return;
        if (isSelectMode) {
          const chk = item.querySelector('.exercise-checkbox');
          if (chk && e.target !== chk) {
            chk.checked = !chk.checked;
            chk.dispatchEvent(new Event('change'));
          }
          return;
        }
        loadExerciseDetail(ex.id);
      });

      exerciseList.appendChild(item);
    });
    if (isSelectMode) updateExerciseListCheckboxes();

    if (!currentExercise && list.length > 0 && !activeId) {
      const firstId = list[0].id;
      const savedProgress = localStorage.getItem('crossword_progress_' + firstId);
      let hasTypedWords = false;
      if (savedProgress) {
        try {
          const obj = JSON.parse(savedProgress);
          if (Object.keys(obj).length > 0) hasTypedWords = true;
        } catch(e) {}
      }
      // Nếu KHÔNG CÓ TỪ NÀO ĐƯỢC NHẬP => Reload sẽ random lại ô cờ mới ngẫu nhiên (shouldReshuffle = true)
      // Nếu ĐÃ CÓ TỪ NHẬP => Giữ nguyên ô cờ cũ và khôi phục tiến trình (shouldReshuffle = false)
      loadExerciseDetail(firstId, !hasTypedWords);
    }
  } catch (err) {
    console.error('Failed to load exercises:', err);
  }
}

// Load single exercise
async function loadExerciseDetail(id, shouldReshuffle = false) {
  try {
    let ex;
    if (shouldReshuffle) {
      // Khi reload trang: tự động sinh bố cục mới ngẫu nhiên
      const res = await fetch(`/api/exercises/${id}/regenerate-layout`, { method: 'POST' });
      const data = await res.json();
      ex = (data && data.success) ? data.exercise : null;
    }

    if (!ex) {
      const res = await fetch(`/api/exercises/${id}`);
      ex = await res.json();
      if (!res.ok) throw new Error(ex.error);
    }

    document.querySelectorAll('.exercise-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });

    renderExercise(ex);
    puzzleSection.style.display = 'block';
    if (noExerciseState) noExerciseState.style.display = 'none';
  } catch (err) {
    console.error(err);
    showPopupAlert('Lỗi khi tải bài tập: ' + err.message, 'Lỗi', 'error');
  }
}

// Delete exercise with custom popup confirm
window.deleteExercise = async function (e, id) {
  e.stopPropagation();

  const confirmed = await showPopupConfirm('Bạn có chắc chắn muốn xoá bài tập này khỏi danh sách không? Thao tác này không thể hoàn tác.', 'Xác nhận xoá bài tập', 'Xoá ngay', true);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/exercises/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Đã xoá bài tập thành công!', 'info');
    if (currentExercise && currentExercise.id === id) {
      currentExercise = null;
      puzzleSection.style.display = 'none';
    }
    loadExercisesList();
  } catch (err) {
    showPopupAlert('Không thể xoá: ' + err.message, 'Lỗi', 'error');
  }
};

// Handle Rename

async function handleReshuffleLayout() {
  if (!currentExercise) return;
  if (!isCheckSolutionClicked) {
    // Kiểm tra xem đã gõ ký tự nào chưa
    const allInputs = document.querySelectorAll('input.cell-input:not(.symbol-input)');
    let hasAnyInput = false;
    allInputs.forEach(inp => {
      if (inp.value && inp.value.trim() !== '') hasAnyInput = true;
    });
    if (!hasAnyInput) {
      // Bàn cờ đang trống hoàn toàn => cho phép đổi bố cục tự do
    } else {
      const placements = currentExercise.placements || [];
    let correctWordCount = 0;
    placements.forEach(p => {
      const dx = p.direction === 'across' ? 1 : 0;
      const dy = p.direction === 'across' ? 0 : 1;
      let isFullWordCorrect = true;
      for (let k = 0; k < p.cleanWord.length; k++) {
        const cr = p.y + k * dy;
        const cc = p.x + k * dx;
        const expected = p.cleanWord[k].toUpperCase();
        if (expected === '-' || expected === ' ') continue;
        const inp = getCellInput(cr, cc);
        if (!inp || inp.value.trim().toUpperCase() !== expected) {
          isFullWordCorrect = false;
          break;
        }
      }
      if (isFullWordCorrect) correctWordCount++;
    });
    if (correctWordCount >= 1 && correctWordCount < placements.length) {
        showToast('⚠️ Nút đổi bố cục đang bị khóa! Bạn cần giải xong toàn bộ hoặc bấm Kiểm tra bài làm để đổi.', 'error');
        return;
      }
    }
  }
  const originalText = btnReshuffleLayout.innerHTML;
  btnReshuffleLayout.disabled = true;
  btnReshuffleLayout.innerHTML = '🎲 Đang xáo trộn & sinh ô chữ mới...';

  try {
    const res = await fetch(`/api/exercises/${currentExercise.id}/regenerate-layout`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Lỗi khi tạo lại bố cục');

    clearUserProgress();
    renderExercise(data.exercise);
    showToast('✨ Đã sinh ra bố cục ô chữ và thứ tự từ vựng mới hoàn toàn!', 'success');
  } catch (err) {
    showPopupAlert('Không thể đổi bố cục: ' + err.message, 'Lỗi', 'error');
  } finally {
    btnReshuffleLayout.disabled = false;
    btnReshuffleLayout.innerHTML = originalText;
  }
}

async function handleRename() {
  const newTitle = editTitleInput.value.trim();
  if (!newTitle) {
    await showPopupAlert('Tên bài tập không được để trống!', 'Chú ý', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/exercises/${currentExercise.id}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentExercise.title = data.title;
    currentExerciseTitle.textContent = data.title;
    titleEditMode.style.display = 'none';
    titleViewMode.style.display = 'flex';
    showToast('Đã cập nhật tên bài tập!', 'success');
    loadExercisesList(currentExercise.id);
  } catch (err) {
    showPopupAlert('Lỗi khi đổi tên: ' + err.message, 'Lỗi', 'error');
  }
}

// Render the Crossword Interface
function renderExercise(exercise) {
  isCheckSolutionClicked = false;
  currentExercise = exercise;

  // Header meta
  currentExerciseTitle.textContent = exercise.title;
  titleEditMode.style.display = 'none';
  titleViewMode.style.display = 'flex';

  const d = new Date(exercise.createdAt);
  puzzleCreatedTime.textContent = `📅 ${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  puzzlePlacedStats.textContent = `🎯 Đã xếp ${exercise.placedWords}/${exercise.totalWords} từ`;
  puzzleDimensions.textContent = `📐 Lưới ${exercise.width}x${exercise.height}`;

  // Build Grid UI
  renderGrid(exercise);

  // Build Clues UI
  renderClues(exercise);
  restoreUserProgress();
  updateReshuffleButtonState();
}

function renderGrid(exercise) {
  crosswordGrid.innerHTML = '';
  const { width, height, grid } = exercise;

  // Auto-scale cell size so the entire crossword fits comfortably without scrolling!
  const scrollArea = document.querySelector('.grid-scroll-area');
  const availableWidth = scrollArea ? (scrollArea.clientWidth - 20) : 650;
  // Calculate optimal cell size based on column count (between 26px and 44px)
  let optimalSize = Math.floor(availableWidth / width);
  if (optimalSize < 24) optimalSize = 24;
  if (optimalSize > 42) optimalSize = 42;

  // Set CSS custom property on crosswordGrid
  crosswordGrid.style.setProperty('--calculated-cell-size', optimalSize + 'px');
  crosswordGrid.style.gridTemplateColumns = `repeat(${width}, ${optimalSize}px)`;
  crosswordGrid.style.gridTemplateRows = `repeat(${height}, ${optimalSize}px)`;

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const cellData = grid[r][c];
      const cellDiv = document.createElement('div');
      cellDiv.className = 'grid-cell';
      cellDiv.dataset.row = r;
      cellDiv.dataset.col = c;

      if (cellData.isBlack) {
        cellDiv.classList.add('black-cell');
      } else if (cellData.isSpecialSymbol) {
        // Ô đặc biệt cho dấu gạch nối hoặc dấu cách trên bàn cờ
        cellDiv.classList.add('symbol-grid-cell');
        if (cellData.symbolChar === '-') {
          cellDiv.classList.add('hyphen-grid-cell');
          cellDiv.textContent = '-';
        } else {
          cellDiv.classList.add('space-grid-cell');
        }
        // Input ẩn/readonly để đồng bộ toạ độ và điều hướng mượt mà
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'cell-input symbol-input';
        input.readOnly = true;
        input.dataset.row = r;
        input.dataset.col = c;
        input.dataset.solution = cellData.char;
        input.dataset.isSymbol = 'true';
        input.value = cellData.symbolChar;
        cellDiv.appendChild(input);
      } else {
        // Clue start number label
        if (cellData.number) {
          const numSpan = document.createElement('span');
          numSpan.className = 'cell-number';
          numSpan.textContent = cellData.number;
          cellDiv.appendChild(numSpan);
        }

        // Input element bình thường cho chữ cái
        const input = document.createElement('input');
        input.type = 'text';
        // input.maxLength = 1; (cho phép Telex bộ gõ gõ ký tự có dấu)
        input.className = 'cell-input';
        input.dataset.row = r;
        input.dataset.col = c;
        input.dataset.solution = cellData.char;
        input.autocomplete = 'off';
        input.spellcheck = false;

        input.addEventListener('focus', () => handleCellFocus(r, c));
        input.addEventListener('keydown', (e) => handleCellKeyDown(e, r, c));
        input.addEventListener('input', (e) => handleCellInput(e, r, c));

        cellDiv.appendChild(input);
      }

      crosswordGrid.appendChild(cellDiv);
    }
  }

  // Focus the first letter of first across clue
  if (exercise.clues.across.length > 0) {
    const firstP = exercise.clues.across[0];
    focusCell(firstP.y, firstP.x);
    highlightWord(firstP);
  }
}

function renderClues(exercise) {
  acrossCluesList.innerHTML = '';
  downCluesList.innerHTML = '';

  const renderClueItem = (p, container) => {
    const item = document.createElement('div');
    item.className = 'clue-item';
    item.dataset.wordId = p.id;
    item.dataset.dir = p.direction;

    item.innerHTML = `
      <div class="clue-title-line">
        <span class="clue-num">${p.number}</span>
        <span class="clue-text">${p.pos ? '<span class="clue-pos">(' + escapeHtml(p.pos) + ')</span> ' : ''}${escapeHtml(p.clue)}</span>
        <button class="btn-speak-clue" title="Phát âm từ này" data-word="${escapeHtml(p.rawWord)}">🔊</button>
        <span class="clue-len">(${p.rawWord.length})</span>
      </div>
      <div class="clue-answer-blank" id="blank-${p.id}"></div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-speak-clue')) {
        e.stopPropagation();
        const btn = e.target.closest('.btn-speak-clue');
        const wordToSpeak = btn.dataset.word;
        if (wordToSpeak) speakEnglishWord(wordToSpeak);
        return;
      }
      const slot = e.target.closest('.blank-slot');
      currentDirection = p.direction;
      highlightWord(p);

      if (slot && slot.dataset.charIdx !== undefined) {
        const k = parseInt(slot.dataset.charIdx, 10);
        const dx = p.direction === 'across' ? 1 : 0;
        const dy = p.direction === 'across' ? 0 : 1;
        currentDirection = p.direction;
        highlightWord(p);
        focusCell(p.y + k * dy, p.x + k * dx);
      } else {
        // Click vào dòng câu hỏi của từ => tự động nhảy đến vị trí cuối cùng đã điền bên phải
        focusWordSmart(p);
      }
    });

    container.appendChild(item);
    syncWordToClue(p);
  };

  exercise.clues.across.forEach(p => renderClueItem(p, acrossCluesList));
  exercise.clues.down.forEach(p => renderClueItem(p, downCluesList));
}

// REALTIME TWO-WAY SYNC
function syncWordToClue(placement) {
  const blank = document.getElementById(`blank-${placement.id}`);
  if (!blank) return;

  const dx = placement.direction === 'across' ? 1 : 0;
  const dy = placement.direction === 'across' ? 0 : 1;

  const wordLen = placement.cleanWord.length;
  blank.innerHTML = '';

  for (let k = 0; k < wordLen; k++) {
    const r = placement.y + k * dy;
    const c = placement.x + k * dx;
    const input = getCellInput(r, c);
    const charSolution = placement.cleanWord[k];

    const slotEl = document.createElement('span');
    slotEl.className = 'blank-slot';
    slotEl.dataset.charIdx = k;

    if (charSolution === '-') {
      slotEl.classList.add('symbol-slot', 'hyphen-slot', 'has-char');
      slotEl.textContent = '-';
    } else if (charSolution === ' ') {
      slotEl.classList.add('symbol-slot', 'space-slot', 'has-char');
      slotEl.innerHTML = '&nbsp;';
    } else {
      const typedVal = input ? input.value.trim().toUpperCase() : '';
      if (typedVal) {
        slotEl.textContent = typedVal;
        slotEl.classList.add('has-char');
      } else {
        slotEl.innerHTML = '&nbsp;';
        slotEl.classList.add('is-empty');
      }
    }

    blank.appendChild(slotEl);
  }
}

function syncCellToClues(r, c) {
  if (!currentExercise || !currentExercise.placements) return;
  currentExercise.placements.forEach(p => {
    if (isCovered(p, r, c)) {
      syncWordToClue(p);
    }
  });
}

function syncAllWordsToClues() {
  if (!currentExercise || !currentExercise.placements) return;
  currentExercise.placements.forEach(p => syncWordToClue(p));
}

// Crossword Navigation & Input Handlers
function focusWordSmart(p) {
  currentDirection = p.direction;
  highlightWord(p);

  const dx = p.direction === 'across' ? 1 : 0;
  const dy = p.direction === 'across' ? 0 : 1;

  // Tìm các ô đã được điền ký tự trong từ này
  let filledIndices = [];
  for (let k = 0; k < p.cleanWord.length; k++) {
    const r = p.y + k * dy;
    const c = p.x + k * dx;
    const input = getCellInput(r, c);
    if (input && input.value.trim() !== '') {
      filledIndices.push(k);
    }
  }

  // Yêu cầu: "mặc định khi click vào từ đã đc điền sẽ hiện ở vị trí cuối cùng bên phải"
  if (filledIndices.length > 0) {
    // Nếu từ đã được điền, focus vào ô cuối cùng đã điền (vị trí xa nhất về bên phải hoặc dưới cùng)
    const lastFilledIdx = filledIndices[filledIndices.length - 1];
    focusCell(p.y + lastFilledIdx * dy, p.x + lastFilledIdx * dx);
  } else {
    // Chưa điền chữ nào => focus ô đầu tiên
    focusCell(p.y, p.x);
  }
}

function focusCell(r, c) {
  const input = getCellInput(r, c);
  if (input) {
    input.focus();
    selectedCell = { r, c };
  }
}

function getCellInput(r, c) {
  return document.querySelector(`input.cell-input[data-row="${r}"][data-col="${c}"]`);
}

function getCellDiv(r, c) {
  return document.querySelector(`.grid-cell[data-row="${r}"][data-col="${c}"]`);
}

function handleCellFocus(r, c) {
  selectedCell = { r, c };

  const placements = currentExercise.placements;
  let match = placements.find(p => p.direction === currentDirection && isCovered(p, r, c));
  if (!match) {
    const oppDir = currentDirection === 'across' ? 'down' : 'across';
    match = placements.find(p => p.direction === oppDir && isCovered(p, r, c));
    if (match) currentDirection = oppDir;
  }

  if (match) {
    highlightWord(match);
  }
}

function isCovered(p, r, c) {
  if (p.direction === 'across') {
    return p.y === r && c >= p.x && c < p.x + p.cleanWord.length;
  } else {
    return p.x === c && r >= p.y && r < p.y + p.cleanWord.length;
  }
}

function highlightWord(placement) {
  currentActiveWord = placement;

  document.querySelectorAll('.grid-cell.active-word').forEach(el => el.classList.remove('active-word'));
  document.querySelectorAll('.grid-cell.active-cell').forEach(el => el.classList.remove('active-cell'));
  document.querySelectorAll('.clue-item.active').forEach(el => el.classList.remove('active'));
  clearWordSelection();

  const dx = placement.direction === 'across' ? 1 : 0;
  const dy = placement.direction === 'across' ? 0 : 1;
  for (let k = 0; k < placement.cleanWord.length; k++) {
    const r = placement.y + k * dy;
    const c = placement.x + k * dx;
    const cell = getCellDiv(r, c);
    if (cell) cell.classList.add('active-word');
  }

  const currentCellDiv = getCellDiv(selectedCell.r, selectedCell.c);
  if (currentCellDiv) currentCellDiv.classList.add('active-cell');

  const clueItem = document.querySelector(`.clue-item[data-word-id="${placement.id}"]`);
  if (clueItem) {
    clueItem.classList.add('active');
    clueItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function handleCellKeyDown(e, r, c) {
  if (isWordSelected) {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      clearCurrentWordInputs();
      clearWordSelection();
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Gõ chữ cái mới khi đang bôi đen => xoá từ cũ và bắt đầu điền từ đầu
      clearCurrentWordInputs();
      clearWordSelection();
      if (currentActiveWord) {
        focusCell(currentActiveWord.y, currentActiveWord.x);
      }
      return;
    } else {
      clearWordSelection();
    }
  }

  // Khi bấm phím ký tự thông thường, nếu ô đã có ký tự thì bôi đen toàn bộ (select) để phím mới hoặc bộ gõ Telex gõ đè trực tiếp mà không bị nhảy lộn xộn
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const input = getCellInput(r, c);
    if (input && input.dataset.isSymbol !== 'true') {
      input.select();
    }
  }

  if (e.key === 'Backspace') {
    const input = getCellInput(r, c);
    if (!input) return;

    // Nếu ô hiện tại thuộc một từ đã được nhập ĐÚNG 100% => KHÔNG CHO PHÉP XÓA
    if (isCellInCompletedWord(r, c)) {
      e.preventDefault();
      return;
    }

    if (input.value !== '') {
      // Nếu ô hiện tại đang có chữ: xóa ô hiện tại
      input.value = '';
      const cellDiv = getCellDiv(r, c);
      if (cellDiv) {
        cellDiv.classList.remove('is-error');
        cellDiv.classList.remove('is-correct');
      }
      syncCellToClues(r, c);
      checkAndHandleCompletedWord(r, c);
      updateReshuffleButtonState();
    } else {
      // Nếu ô hiện tại rỗng: lùi về ô trước đó trong từ hiện tại VÀ xóa chữ ở ô đó để cho phép sửa lại
      moveToStep(r, c, -1);
      if (selectedCell) {
        // Không xóa nếu ô lùi về thuộc từ đã giải đúng
        if (isCellInCompletedWord(selectedCell.r, selectedCell.c)) {
          e.preventDefault();
          return;
        }
        const prevInput = getCellInput(selectedCell.r, selectedCell.c);
        if (prevInput && prevInput.dataset.isSymbol !== 'true') {
          prevInput.value = '';
          const prevCellDiv = getCellDiv(selectedCell.r, selectedCell.c);
          if (prevCellDiv) {
            prevCellDiv.classList.remove('is-error');
            prevCellDiv.classList.remove('is-correct');
          }
          syncCellToClues(selectedCell.r, selectedCell.c);
          checkAndHandleCompletedWord(selectedCell.r, selectedCell.c);
          updateReshuffleButtonState();
        }
      }
    }
    e.preventDefault();
  } else if (e.key === 'ArrowRight') {
    currentDirection = 'across';
    moveToStep(r, c, 1);
    e.preventDefault();
  } else if (e.key === 'ArrowLeft') {
    currentDirection = 'across';
    moveToStep(r, c, -1);
    e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    // Mũi tên xuống: nhảy xuống từ tiếp theo theo danh sách cột bên phải
    e.preventDefault();
    navigateClueWord(1);
  } else if (e.key === 'ArrowUp') {
    // Mũi tên lên: nhảy lên từ phía trên theo danh sách cột bên phải
    e.preventDefault();
    navigateClueWord(-1);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    cycleNextWord();
  }
}

function handleCellInput(e, r, c) {
  const input = getCellInput(r, c);
  if (input.dataset.isSymbol === 'true') return;

  // Chấp nhận toàn bộ ký tự bao gồm cả ký tự tiếng Việt có dấu khi gõ Telex (ví dụ: ă, â, đ, ê, ô, ơ, ư, á, à, ả, ã, ạ...)
  const cleanChars = Array.from(input.value.replace(/[^\p{L}\p{N}]/gu, ''));
  const val = cleanChars.length > 0 ? cleanChars[cleanChars.length - 1].toUpperCase() : '';
  input.value = val;

  const cellDiv = getCellDiv(r, c);
  const solution = (input.dataset.solution || '').toUpperCase();

  if (cellDiv) {
    cellDiv.classList.remove('is-error');
    cellDiv.classList.remove('is-correct');
    cellDiv.classList.remove('is-locked');
    if (input.dataset.isSymbol !== 'true') input.readOnly = false;
    cellDiv.classList.remove('is-locked');
  }

  syncCellToClues(r, c);
  updateReshuffleButtonState();

  // Luôn kiểm tra lại trạng thái từ khi gõ (dù đúng hay sai) để lập tức bật/tắt màu xanh và âm thanh tương ứng
  checkAndHandleCompletedWord(r, c);

  if (val) {
    // Tự động nhảy sang ô tiếp theo
    moveToStep(r, c, 1);
  }
}

function moveToStep(r, c, step) {
  if (!currentActiveWord) return;
  const p = currentActiveWord;
  const isAcross = p.direction === 'across';

  let nextR = isAcross ? r : r + step;
  let nextC = isAcross ? c + step : c;

  // Chỉ nhảy qua ô ký tự đặc biệt ('-' hoặc dấu cách cố định)
  while (isCovered(p, nextR, nextC)) {
    const nextInput = getCellInput(nextR, nextC);
    if (!nextInput) break;

    if (nextInput.dataset.isSymbol === 'true') {
      nextR = isAcross ? nextR : nextR + step;
      nextC = isAcross ? nextC + step : nextC;
    } else {
      break;
    }
  }

  if (isCovered(p, nextR, nextC)) {
    focusCell(nextR, nextC);
    const cell = getCellDiv(nextR, nextC);
    document.querySelectorAll('.grid-cell.active-cell').forEach(el => el.classList.remove('active-cell'));
    if (cell) cell.classList.add('active-cell');
  }
}

function cycleNextWord() {
  if (!currentExercise || !currentExercise.placements.length) return;
  const list = currentExercise.placements;
  let idx = list.findIndex(p => p.id === (currentActiveWord ? currentActiveWord.id : -1));
  idx = (idx + 1) % list.length;
  const nextP = list[idx];
  currentDirection = nextP.direction;
  focusCell(nextP.y, nextP.x);
  highlightWord(nextP);
}


// Phát âm tiếng Anh tự nhiên qua Web Speech API
function speakEnglishWord(word) {
  if (!('speechSynthesis' in window) || !word) return;
  try {
    window.speechSynthesis.cancel(); // Dừng câu trước nếu còn
    const cleanToSpeak = word.replace(/[-_]/g, ' ').trim();
    const utterance = new SpeechSynthesisUtterance(cleanToSpeak);
    utterance.lang = 'en-US';
    utterance.rate = 0.9; // Tốc độ vừa phải, rõ âm
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error('Speech synthesis error:', err);
  }
}

// Kiểm tra xem từ có vừa được hoàn thành đúng 100% không
function checkAndHandleCompletedWord(r, c) {
  if (!currentExercise || !currentExercise.placements) return;

  currentExercise.placements.forEach(p => {
    if (isCovered(p, r, c)) {
      const dx = p.direction === 'across' ? 1 : 0;
      const dy = p.direction === 'across' ? 0 : 1;
      let isFullWordCorrect = true;

      for (let k = 0; k < p.cleanWord.length; k++) {
        const cr = p.y + k * dy;
        const cc = p.x + k * dx;
        const cellInput = getCellInput(cr, cc);
        const expected = p.cleanWord[k].toUpperCase();

        if (expected === '-' || expected === ' ') continue;

        if (!cellInput || cellInput.value.trim().toUpperCase() !== expected) {
          isFullWordCorrect = false;
          break;
        }
      }

      const clueEl = document.querySelector(`.clue-item[data-word-id="${p.id}"]`);
      if (isFullWordCorrect) {
        if (clueEl && !clueEl.classList.contains('word-completed')) {
          clueEl.classList.add('word-completed');
          speakEnglishWord(p.rawWord);
          showToast('🎉 Chính xác từ: ' + p.rawWord + '!', 'success');
        }
        for (let k = 0; k < p.cleanWord.length; k++) {
          const cr = p.y + k * dy;
          const cc = p.x + k * dx;
          const cellDiv = getCellDiv(cr, cc);
          if (cellDiv && !cellDiv.classList.contains('symbol-grid-cell')) {
            cellDiv.classList.remove('is-error');
            cellDiv.classList.add('is-correct');
          }
        }
      } else {
        // Nếu từ này ĐANG SAI hoặc BỊ SỬA SAI => Gỡ bỏ trạng thái hoàn thành và xóa nền xanh
        if (clueEl) clueEl.classList.remove('word-completed');
        for (let k = 0; k < p.cleanWord.length; k++) {
          const cr = p.y + k * dy;
          const cc = p.x + k * dx;
          // Kiểm tra xem ô này có thuộc từ nào khác đang đúng 100% không
          const isPartOfAnotherCorrectWord = currentExercise.placements.some(otherP => {
            if (otherP.id === p.id || !isCovered(otherP, cr, cc)) return false;
            const odx = otherP.direction === 'across' ? 1 : 0;
            const ody = otherP.direction === 'across' ? 0 : 1;
            for (let m = 0; m < otherP.cleanWord.length; m++) {
              const ocr = otherP.y + m * ody;
              const occ = otherP.x + m * odx;
              const exp = otherP.cleanWord[m].toUpperCase();
              if (exp === '-' || exp === ' ') continue;
              const inp = getCellInput(ocr, occ);
              if (!inp || inp.value.trim().toUpperCase() !== exp) return false;
            }
            return true;
          });
          if (!isPartOfAnotherCorrectWord) {
            const cellDiv = getCellDiv(cr, cc);
            if (cellDiv) cellDiv.classList.remove('is-correct');
          }
        }
      }
    }
  });

  // Kiểm tra nếu tất cả các ô trên bàn cờ đều đã đúng 100%
  checkAllBoardCompleted();
}

function checkAllBoardCompleted() {
  const inputs = document.querySelectorAll('input.cell-input:not(.symbol-input)');
  if (inputs.length === 0) return;
  let allCorrect = true;

  inputs.forEach(input => {
    if (input.value.trim().toUpperCase() !== input.dataset.solution.toUpperCase()) {
      allCorrect = false;
    }
  });

  if (allCorrect) {
    setTimeout(() => {
      showPopupAlert('Chúc mừng! Bạn đã hoàn thành chính xác 100% tất cả các từ trong ô chữ!', 'Chiến thắng xuất sắc! 🎉', 'success');
    }, 500);
  }
}

// Check Solution
function handleCheckSolution() {
  if (!currentExercise) return;
  isCheckSolutionClicked = true;
  updateReshuffleButtonState();
  document.querySelectorAll(".clue-item").forEach(el => el.classList.add("show-audio"));
  let totalLetters = 0;
  let correctLetters = 0;
  let errors = 0;
  const inputs = document.querySelectorAll('input.cell-input:not(.symbol-input)');
  inputs.forEach(input => {
    totalLetters++;
    const r = input.dataset.row;
    const c = input.dataset.col;
    const cellDiv = getCellDiv(r, c);
    const val = input.value.trim().toUpperCase();
    const solution = (input.dataset.solution || '').toUpperCase();
    cellDiv.classList.remove('is-error');
    cellDiv.classList.remove('is-correct');
    if (val === solution && val !== '') {
      correctLetters++;
    } else {
      cellDiv.classList.add('is-error');
      errors++;
    }
  });
  if (currentExercise.placements) {
    currentExercise.placements.forEach(p => {
      const dx = p.direction === 'across' ? 1 : 0;
      const dy = p.direction === 'across' ? 0 : 1;
      let isFullWordCorrect = true;
      for (let k = 0; k < p.cleanWord.length; k++) {
        const cr = p.y + k * dy;
        const cc = p.x + k * dx;
        const cellInput = getCellInput(cr, cc);
        const expected = p.cleanWord[k].toUpperCase();
        if (expected === '-' || expected === ' ') continue;
        if (!cellInput || cellInput.value.trim().toUpperCase() !== expected) {
          isFullWordCorrect = false;
          break;
        }
      }
      if (isFullWordCorrect) {
        for (let k = 0; k < p.cleanWord.length; k++) {
          const cr = p.y + k * dy;
          const cc = p.x + k * dx;
          const cellDiv = getCellDiv(cr, cc);
          if (cellDiv && !cellDiv.classList.contains('symbol-grid-cell')) {
            cellDiv.classList.remove('is-error');
            cellDiv.classList.add('is-correct');
          }
        }
      }
    });
  }
  if (correctLetters === totalLetters) {
    showPopupAlert('Chúc mừng! Bạn đã hoàn thành 100% tất cả các từ trong ô chữ!', 'Chiến thắng xuất sắc! 🎉', 'success');
  } else {
    showToast('Có ' + errors + ' ô chưa điền hoặc bị sai (đã được đánh dấu đỏ)!', 'info');
  }
}

// Reveal All Answers with Popup Confirm
async function handleRevealAll() {
  if (!currentExercise) return;

  const confirmed = await showPopupConfirm('Bạn có muốn xem toàn bộ đáp án của bài tập này không? Các từ chưa làm hoặc làm sai sẽ được hiển thị đáp án với ô màu đỏ để bạn đối chiếu.', 'Xem toàn bộ đáp án', 'Hiện đáp án');
  if (!confirmed) return;

  // 1. Quét trạng thái hiện tại của người dùng: ô nào đã điền đúng trước đó
  const inputs = document.querySelectorAll('input.cell-input:not(.symbol-input)');
  inputs.forEach(input => {
    const r = input.dataset.row;
    const c = input.dataset.col;
    const cellDiv = getCellDiv(r, c);
    const typedVal = input.value.trim().toUpperCase();
    const solution = (input.dataset.solution || '').toUpperCase();

    // Điền đáp án chuẩn vào ô
    input.value = solution;

    if (cellDiv) {
      cellDiv.classList.remove('is-error');
      cellDiv.classList.remove('is-correct');

      // Nếu ô này người dùng đã tự gõ đúng từ trước => Hiện nền xanh
      // Nếu ô này chưa gõ hoặc gõ sai => Hiện nền đỏ (để nhận biết đây là đáp án được hé lộ/sửa sai)
      if (typedVal === solution && typedVal !== '') {
        cellDiv.classList.add('is-correct');
      } else {
        cellDiv.classList.add('is-error');
      }
    }
  });

  // 2. Mở loa và hoàn thành bên danh sách gợi ý
  document.querySelectorAll('.clue-item').forEach(el => el.classList.add('word-completed', 'show-audio'));
  syncAllWordsToClues();
  showToast('Đã hiển thị toàn bộ đáp án! Những ô bạn chưa làm hoặc sai có màu đỏ để bạn đối chiếu.', 'info');
  updateReshuffleButtonState();
}

window.handleRevealAll = handleRevealAll;
window.handleClearAnswers = handleClearAnswers;

// Clear Answers with Popup Confirm
async function handleClearAnswers() {
  if (!currentExercise) return;

  const confirmed = await showPopupConfirm('Bạn có muốn xoá toàn bộ chữ cái đã điền để làm lại từ đầu không?', 'Làm lại từ đầu', 'Xoá & Làm lại', true);
  if (!confirmed) return;

  // 1. Reset cờ trạng thái kiểm tra
  isCheckSolutionClicked = false;

  // 2. Xóa toàn bộ giá trị và gỡ sạch class trên ô chữ
  const inputs = document.querySelectorAll('input.cell-input');
  inputs.forEach(input => {
    if (input.dataset.isSymbol !== 'true') {
      input.value = '';
      input.readOnly = false;
    }
    const cellDiv = getCellDiv(input.dataset.row, input.dataset.col);
    if (cellDiv) {
      cellDiv.classList.remove('is-error', 'is-correct', 'is-locked', 'word-selected');
    }
  });

  // 3. Gỡ sạch viền xanh và ẩn loa trên danh sách gợi ý
  document.querySelectorAll('.clue-item').forEach(el => {
    el.classList.remove('word-completed', 'show-audio', 'word-selected');
  });

  // 4. Xóa bộ nhớ lưu tiến trình
  clearUserProgress();

  // 5. Đồng bộ lại blanks
  syncAllWordsToClues();

  // 6. Cập nhật lại nút đổi bố cục (sẽ mở khóa lại ngay)
  updateReshuffleButtonState();

  showToast('Đã xoá sạch toàn bộ ô để bạn làm lại từ đầu!', 'info');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}
// Append ordering function at the end of file (or near other utilities)
function getOrderedPlacements(exercise) {
  if (!exercise || !exercise.placements) return [];
  const sortFn = (a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    // If same start cell, prioritize across over down
    if (a.direction === b.direction) return 0;
    return a.direction === 'across' ? -1 : 1;
  };
  // Create separate arrays then concat across first ensures across above down when same start
  const acrossList = exercise.placements.filter(p => p.direction === 'across').sort(sortFn);
  const downList = exercise.placements.filter(p => p.direction === 'down').sort(sortFn);
  return [...acrossList, ...downList];
}

// Update cycleNextWord to use the ordered list
function cycleNextWord() {
  if (!currentExercise || !currentExercise.placements.length) return;
  const ordered = getOrderedPlacements(currentExercise);
  let idx = ordered.findIndex(p => p.id === (currentActiveWord ? currentActiveWord.id : -1));
  idx = (idx + 1) % ordered.length;
  const nextP = ordered[idx];
  currentDirection = nextP.direction;
  focusCell(nextP.y, nextP.x);
  highlightWord(nextP);
}
// Append new utility functions and key handling at the end of app.js (before export if any)

function clearAllInputs() {
  isCheckSolutionClicked = false;
  const inputs = document.querySelectorAll('input.cell-input');
  inputs.forEach(input => {
    input.value = '';
    const cellDiv = getCellDiv(input.dataset.row, input.dataset.col);
    cellDiv.classList.remove('is-error');
    cellDiv.classList.remove('is-correct');
  });
  document.querySelectorAll('.clue-item.word-completed').forEach(el => el.classList.remove('word-completed', 'show-audio'));
  syncAllWordsToClues();
  clearUserProgress();
  showToast('Đã xoá toàn bộ ô chữ!', 'info');
  updateReshuffleButtonState();
}


function selectCurrentWord() {
  if (!currentActiveWord) return;
  isWordSelected = true;
  const p = currentActiveWord;
  const dx = p.direction === 'across' ? 1 : 0;
  const dy = p.direction === 'across' ? 0 : 1;

  for (let k = 0; k < p.cleanWord.length; k++) {
    const r = p.y + k * dy;
    const c = p.x + k * dx;
    const cell = getCellDiv(r, c);
    if (cell) cell.classList.add('word-selected');
  }

  const clueItem = document.querySelector(`.clue-item[data-word-id="${p.id}"]`);
  if (clueItem) clueItem.classList.add('word-selected');
  showToast('Đã chọn toàn bộ từ. Nhấn Backspace/Delete để xoá, hoặc gõ phím để thay thế.', 'info');
}

function clearWordSelection() {
  if (!isWordSelected) return;
  isWordSelected = false;
  document.querySelectorAll('.grid-cell.word-selected').forEach(el => el.classList.remove('word-selected'));
  document.querySelectorAll('.clue-item.word-selected').forEach(el => el.classList.remove('word-selected'));
}

function clearCurrentWordInputs() {
  if (!currentActiveWord) return;
  const p = currentActiveWord;
  const dx = p.direction === 'across' ? 1 : 0;
  const dy = p.direction === 'across' ? 0 : 1;
  for (let k = 0; k < p.cleanWord.length; k++) {
    const r = p.y + k * dy;
    const c = p.x + k * dx;
    const input = getCellInput(r, c);
    if (input) {
      input.value = '';
      const cellDiv = getCellDiv(r, c);
      cellDiv.classList.remove('is-error');
      cellDiv.classList.remove('is-correct');
      cellDiv.classList.remove('is-locked');
      if (input.dataset.isSymbol !== 'true') input.readOnly = false;
    }
  }
  syncAllWordsToClues();

  // Khi xoá hết từ: Đưa dấu nháy focus quay trở lại ô ĐẦU TIÊN của từ (bên trái/trên cùng)
  focusCell(p.y, p.x);
  const startCellDiv = getCellDiv(p.y, p.x);
  document.querySelectorAll('.grid-cell.active-cell').forEach(el => el.classList.remove('active-cell'));
  if (startCellDiv) startCellDiv.classList.add('active-cell');

  showToast('Đã xoá từ, sẵn sàng nhập lại từ đầu!', 'info');
}

// Global keyboard shortcuts:
// - Khi đang focus / trỏ vào 1 ô ô chữ:
//   + Ctrl + A: Xoá sạch toàn bộ chữ của TỪ HIỆN TẠI (Word Selection)
//   + Ctrl + Shift + A (hoặc nút "Làm lại từ đầu"): Mới xoá toàn bộ bài tập
// - Nếu không trỏ vào ô nào: Ctrl + A xoá toàn bộ bảng
window.addEventListener('keydown', (e) => {
  const activeEl = document.activeElement;
  const isCellInput = activeEl && activeEl.classList && activeEl.classList.contains('cell-input');

  // Ctrl + Shift + A => Xoá sạch toàn bộ bàn cờ
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    clearAllInputs();
    return;
  }

  // Ctrl + A: CHỈ BÔI ĐEN / CHỌN TOÀN BỘ TỪ, KHÔNG TỰ ĐỘNG XOÁ!
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    if (isCellInput || currentActiveWord) {
      // Bôi đen toàn bộ từ đang chọn, người dùng bấm Backspace / Delete mới xoá!
      selectCurrentWord();
    }
    return;
  }

  // Ctrl + Shift + Backspace hoặc Ctrl + Backspace => xoá từ hiện tại
  if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
    e.preventDefault();
    clearCurrentWordInputs();
    return;
  }
});

window.addEventListener('resize', () => {
  if (currentExercise) {
    const scrollArea = document.querySelector('.grid-scroll-area');
    if (scrollArea && crosswordGrid) {
      const availableWidth = scrollArea.clientWidth - 20;
      let optimalSize = Math.floor(availableWidth / currentExercise.width);
      if (optimalSize < 24) optimalSize = 24;
      if (optimalSize > 42) optimalSize = 42;
      crosswordGrid.style.setProperty('--calculated-cell-size', optimalSize + 'px');
      crosswordGrid.style.gridTemplateColumns = `repeat(${currentExercise.width}, ${optimalSize}px)`;
      crosswordGrid.style.gridTemplateRows = `repeat(${currentExercise.height}, ${optimalSize}px)`;
    }
  }
});

window.handleBatchDelete = handleBatchDelete;
