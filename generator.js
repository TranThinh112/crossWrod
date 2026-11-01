// generator.js - High performance crossword generator algorithm
// Supports words with spaces, hyphens, punctuation.
// Keeps raw words intact for display/clues, while normalizing to alphanumeric for grid matching.

function normalizeWord(rawWord) {
  if (!rawWord) return '';
  // Giữ lại chữ cái, số, dấu cách và dấu gạch nối
  return rawWord.toString().trim().replace(/[^a-zA-Z0-9 -]/g, '').toUpperCase();
}

function parseWordList(inputText) {
  if (!inputText) return [];
  const lines = inputText.split(/\r?\n/);
  const items = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    let rawWord = '';
    let clue = '';
    let pos = ''; // Part of speech: v, n, adj, adv, phr, etc.

    if (line.includes(':')) {
      const parts = line.split(':');
      rawWord = parts[0].trim();
      clue = parts.slice(1).join(':').trim();
    } else if (line.includes('\t')) {
      const parts = line.split('\t');
      rawWord = parts[0].trim();
      clue = parts.slice(1).join(' ').trim();
    } else if (line.includes(' - ')) {
      const parts = line.split(' - ');
      rawWord = parts[0].trim();
      clue = parts.slice(1).join(' - ').trim();
    } else {
      rawWord = line;
      clue = '';
    }

    // Trích xuất loại từ nếu có trong rawWord: vd "abandon (v)", "post office (n)"
    const rawPosMatch = rawWord.match(/\(([a-zA-Z, /]+)\)\s*$/);
    if (rawPosMatch) {
      pos = rawPosMatch[1].trim().toLowerCase();
      rawWord = rawWord.replace(/\([a-zA-Z, /]+\)\s*$/, '').trim();
    }

    // Hoặc trích xuất loại từ nếu bắt đầu trong clue: vd "(v) từ bỏ", "(adj, adv) bán thời gian"
    if (!pos && clue) {
      const cluePosMatch = clue.match(/^\(([a-zA-Z, /]+)\)\s*/);
      if (cluePosMatch) {
        pos = cluePosMatch[1].trim().toLowerCase();
        clue = clue.replace(/^\([a-zA-Z, /]+\)\s*/, '').trim();
      }
    }

    const cleanWord = normalizeWord(rawWord);
    if (cleanWord.length >= 2) {
      items.push({
        rawWord,
        cleanWord,
        pos: pos || '',
        clue: clue || rawWord
      });
    }
  }

  // Remove duplicates based on cleanWord
  const seen = new Set();
  const uniqueItems = [];
  for (const item of items) {
    if (!seen.has(item.cleanWord)) {
      seen.add(item.cleanWord);
      uniqueItems.push(item);
    }
  }

  return uniqueItems;
}

class CrosswordBuilder {
  constructor(words, maxGridSize = 40) {
    this.words = words; // array of { rawWord, cleanWord, clue }
    this.maxGridSize = maxGridSize;
  }

  buildBestLayout(attempts = 45) {
    const validFullResults = [];
    let bestResult = null;
    let maxPlaced = -1;
    let minArea = Infinity;

    // Pick a random starter word among the words to guarantee a fresh root layout each time
    for (let i = 0; i < attempts; i++) {
      // Shuffle words with heavy randomness while keeping reasonable diversity
      const shuffled = [...this.words].sort(() => Math.random() - 0.5);
      // Ensure the starter word has good length (>= 4) for high intersection probability
      const goodStarters = shuffled.filter(w => w.cleanWord.length >= 4);
      const starter = goodStarters.length > 0
        ? goodStarters[Math.floor(Math.random() * goodStarters.length)]
        : shuffled[0];
      const remaining = shuffled.filter(w => w.cleanWord !== starter.cleanWord);
      // Sort remaining partially by length with random jitter
      remaining.sort((a, b) => (b.cleanWord.length - a.cleanWord.length) + (Math.random() * 4 - 2));
      const order = [starter, ...remaining];

      // Randomize initial direction: across or down
      const initialDir = Math.random() < 0.5 ? 'across' : 'down';
      const result = this.attemptLayout(order, initialDir);

      if (result.placements.length === this.words.length) {
        validFullResults.push(result);
        if (validFullResults.length >= 8) break; // Collect multiple distinct 100% solutions
      }

      if (result.placements.length > maxPlaced) {
        maxPlaced = result.placements.length;
        minArea = result.area;
        bestResult = result;
      } else if (result.placements.length === maxPlaced && result.area < minArea) {
        minArea = result.area;
        bestResult = result;
      }
    }

    // Pick randomly among valid full solutions so each reload / regeneration gets a completely new crossword!
    const chosenResult = validFullResults.length > 0
      ? validFullResults[Math.floor(Math.random() * validFullResults.length)]
      : bestResult;

    return this.finalizeLayout(chosenResult);
  }

  attemptLayout(words, initialDir = 'across') {
    const grid = new Map(); // key "x,y" => char
    const cellOwners = new Map(); // key "x,y" => array of { wordIndex, dir, charIdx }
    const placements = [];

    // Place first word at (0, 0) with chosen initial direction
    const first = words[0];
    this.placeWord(grid, cellOwners, placements, first, 0, 0, initialDir, 0);

    for (let wIdx = 1; wIdx < words.length; wIdx++) {
      const item = words[wIdx];
      const word = item.cleanWord;
      const candidates = [];

      // Find intersections with placed words
      for (const placed of placements) {
        const otherDir = placed.direction;
        const targetDir = otherDir === 'across' ? 'down' : 'across';

        for (let i = 0; i < word.length; i++) {
          const char = word[i];
          for (let j = 0; j < placed.cleanWord.length; j++) {
            if (placed.cleanWord[j] === char) {
              // Potential intersection at placed cell
              const intersectX = placed.direction === 'across' ? placed.x + j : placed.x;
              const intersectY = placed.direction === 'across' ? placed.y : placed.y + j;

              const startX = targetDir === 'across' ? intersectX - i : intersectX;
              const startY = targetDir === 'across' ? intersectY : intersectY - i;

              if (this.canPlaceWord(grid, cellOwners, word, startX, startY, targetDir, wIdx)) {
                // Score placement: prefer more intersections, compact bounding box
                const score = this.scorePlacement(grid, placements, word, startX, startY, targetDir);
                candidates.push({ x: startX, y: startY, dir: targetDir, score });
              }
            }
          }
        }
      }

      if (candidates.length > 0) {
        // Pick best candidate
        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        this.placeWord(grid, cellOwners, placements, item, best.x, best.y, best.dir, wIdx);
      }
    }

    // Compute bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const key of grid.keys()) {
      const [x, y] = key.split(',').map(Number);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const width = maxX >= minX ? maxX - minX + 1 : 0;
    const height = maxY >= minY ? maxY - minY + 1 : 0;

    return {
      grid,
      placements,
      bounds: { minX, maxX, minY, maxY, width, height },
      area: width * height
    };
  }

  canPlaceWord(grid, cellOwners, word, startX, startY, dir, wordIndex) {
    const len = word.length;
    const dx = dir === 'across' ? 1 : 0;
    const dy = dir === 'across' ? 0 : 1;

    // Check pre-word buffer cell
    const beforeKey = `${startX - dx},${startY - dy}`;
    if (grid.has(beforeKey)) return false;

    // Check post-word buffer cell
    const afterKey = `${startX + len * dx},${startY + len * dy}`;
    if (grid.has(afterKey)) return false;

    let hasIntersection = false;

    for (let k = 0; k < len; k++) {
      const x = startX + k * dx;
      const y = startY + k * dy;
      const key = `${x},${y}`;

      if (grid.has(key)) {
        if (grid.get(key) !== word[k]) {
          return false; // Character conflict
        }
        // Chỉ coi là điểm giao nhau hợp lệ nếu là chữ cái hoặc số (không giao nhau tại dấu cách hoặc gạch nối)
        if (word[k] !== ' ' && word[k] !== '-') {
          hasIntersection = true;
        } else {
          return false; // Tránh 2 từ đè lên nhau tại dấu cách hoặc dấu gạch nối
        }

        // If cell has already another word with the same direction, conflict
        const owners = cellOwners.get(key) || [];
        if (owners.some(o => o.dir === dir)) return false;
      } else {
        // Adjacent parallel cells must be empty to avoid touching words illegitimately
        if (dir === 'across') {
          if (grid.has(`${x},${y - 1}`) || grid.has(`${x},${y + 1}`)) return false;
        } else {
          if (grid.has(`${x - 1},${y}`) || grid.has(`${x + 1},${y}`)) return false;
        }
      }
    }

    return hasIntersection;
  }

  scorePlacement(grid, existingPlacements, word, startX, startY, dir) {
    let score = 10;
    const len = word.length;
    const dx = dir === 'across' ? 1 : 0;
    const dy = dir === 'across' ? 0 : 1;

    for (let k = 0; k < len; k++) {
      const x = startX + k * dx;
      const y = startY + k * dy;
      const key = `${x},${y}`;
      if (grid.has(key)) {
        if (word[k] !== ' ' && word[k] !== '-') score += 25;
      }
    }

    // Penalize extreme distances from origin
    score -= (Math.abs(startX) + Math.abs(startY)) * 0.1;
    return score;
  }

  placeWord(grid, cellOwners, placements, item, startX, startY, dir, wordIndex) {
    const word = item.cleanWord;
    const dx = dir === 'across' ? 1 : 0;
    const dy = dir === 'across' ? 0 : 1;

    for (let k = 0; k < word.length; k++) {
      const x = startX + k * dx;
      const y = startY + k * dy;
      const key = `${x},${y}`;
      grid.set(key, word[k]);

      if (!cellOwners.has(key)) {
        cellOwners.set(key, []);
      }
      cellOwners.get(key).push({ wordIndex, dir, charIdx: k });
    }

    placements.push({
      rawWord: item.rawWord,
      cleanWord: item.cleanWord,
      pos: item.pos || '',
      clue: item.clue,
      x: startX,
      y: startY,
      direction: dir,
      length: word.length
    });
  }

  finalizeLayout(layoutResult) {
    if (!layoutResult || layoutResult.placements.length === 0) {
      return { success: false, message: 'Không thể tạo crossword từ các từ đã cho.' };
    }

    const { minX, minY, width, height } = layoutResult.bounds;
    const placements = layoutResult.placements;

    // Normalize coordinates so grid starts at (0,0)
    for (const p of placements) {
      p.x -= minX;
      p.y -= minY;
    }

    // Numbering clues according to crossword rules:
    // Sort starting cells by row then col
    const startCellMap = new Map(); // "x,y" => number
    let currentNumber = 1;

    const sortedByPosition = [...placements].sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    for (const p of sortedByPosition) {
      const key = `${p.x},${p.y}`;
      if (!startCellMap.has(key)) {
        startCellMap.set(key, currentNumber++);
      }
      p.number = startCellMap.get(key);
    }

    // Build full grid 2D array
    const grid = Array.from({ length: height }, (_, r) =>
      Array.from({ length: width }, (_, c) => ({
        row: r,
        col: c,
        char: '',
        isBlack: true,
        number: null,
        acrossWordId: null,
        downWordId: null
      }))
    );

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      p.id = i + 1;
      const dx = p.direction === 'across' ? 1 : 0;
      const dy = p.direction === 'across' ? 0 : 1;

      for (let k = 0; k < p.cleanWord.length; k++) {
        const c = p.x + k * dx;
        const r = p.y + k * dy;
        const cell = grid[r][c];
        const ch = p.cleanWord[k];
        cell.char = ch;
        cell.isBlack = false;
        if (ch === ' ' || ch === '-') {
          cell.isSpecialSymbol = true;
          cell.symbolChar = ch;
        }
        if (k === 0) {
          cell.number = p.number;
        }
        if (p.direction === 'across') {
          cell.acrossWordId = p.id;
        } else {
          cell.downWordId = p.id;
        }
      }
    }

    // Group clues into across and down
    const acrossClues = placements
      .filter(p => p.direction === 'across')
      .sort((a, b) => a.number - b.number);

    const downClues = placements
      .filter(p => p.direction === 'down')
      .sort((a, b) => a.number - b.number);

    return {
      success: true,
      width,
      height,
      totalWords: this.words.length,
      placedWords: placements.length,
      unplacedWords: this.words.filter(w => !placements.some(p => p.cleanWord === w.cleanWord)),
      grid,
      placements,
      clues: {
        across: acrossClues,
        down: downClues
      }
    };
  }
}

function generateCrossword(inputText, options = {}) {
  const words = parseWordList(inputText);
  if (words.length < 15 && !options.allowFewer) {
    return {
      success: false,
      error: `Số lượng từ hợp lệ hiện tại là ${words.length}. Vui lòng nhập tối thiểu 15 từ vựng!`
    };
  }

  const builder = new CrosswordBuilder(words);
  const layout = builder.buildBestLayout(options.attempts || 60);

  return {
    ...layout,
    parsedCount: words.length
  };
}

module.exports = {
  normalizeWord,
  parseWordList,
  generateCrossword
};
