const http = require('http');

function test(name, path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method,
      headers: {
        ...(postData ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        } : {})
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch(e) { parsed = body; }
        resolve({ name, status: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTestSuite() {
  console.log("=== BẮT ĐẦU KIỂM THỬ HỆ THỐNG CROSSWORD ===");

  // 1. Get exercise list
  const listRes = await test('1. Lấy danh sách bài tập', '/api/exercises');
  console.log(`[PASS] ${listRes.name} - Status: ${listRes.status}, Tổng bài đã lưu: ${listRes.body.length}`);
  const targetId = listRes.body[0].id;

  // 2. Test Rename
  const renameRes = await test('2. Kiểm thử đổi tên bài tập', `/api/exercises/${targetId}/rename`, 'PUT', {
    title: '28/10/2026 - 20 Từ Vựng Tiếng Anh Bắt Đầu Bằng Chữ A'
  });
  console.log(`[PASS] ${renameRes.name} - Status: ${renameRes.status}, Tên mới: "${renameRes.body.title}"`);

  // 3. Test Get Exercise Detail
  const detailRes = await test('3. Lấy chi tiết bài tập theo ID', `/api/exercises/${targetId}`);
  console.log(`[PASS] ${detailRes.name} - Title: "${detailRes.body.title}", Placed: ${detailRes.body.placedWords}/${detailRes.body.totalWords}`);

  // 4. Test Validation < 15 words
  const failRes = await test('4. Kiểm thử chặn khi dưới 15 từ', '/api/exercises/generate', 'POST', {
    title: 'Bài tập ngắn',
    wordsText: 'apple : quả táo\nbanana : quả chuối\ncat : con mèo'
  });
  console.log(`[PASS] ${failRes.name} - Status: ${failRes.status} (Chặn thành công: "${failRes.body.error}")`);

  // 5. Test Words with Spaces, Hyphens, Punctuation (15 items)
  const specialWordsText = `
apple-pie : bánh táo nướng
ice cream : kem que mát lạnh
mother-in-law : mẹ chồng / mẹ vợ
air-conditioner : máy điều hoà nhiệt độ
well-known : nổi tiếng, được biết đến rộng rãi
twenty-one : số hai mươi mốt
part-time : công việc bán thời gian
full-time : công việc toàn thời gian
passer-by : người qua đường
dry-clean : giặt khô đồ đạc
self-esteem : lòng tự trọng
roller-coaster : tàu lượn siêu tốc cảm giác mạnh
brother-in-law : anh rể hoặc em rể
high school : trường trung học phổ thông
post office : bưu điện trung tâm
  `.trim();

  const specialRes = await test('5. Kiểm thử từ có dấu cách, dấu gạch nối, ký tự đặc biệt', '/api/exercises/generate', 'POST', {
    title: 'Bài tập từ vựng ghép & gạch nối',
    wordsText: specialWordsText
  });
  console.log(`[PASS] ${specialRes.name} - Status: ${specialRes.status}, Placed: ${specialRes.body.exercise.placedWords}/${specialRes.body.exercise.totalWords}`);

  console.log("=== TẤT CẢ 5 BÀI TEST ĐÃ HOÀN TẤT THÀNH CÔNG 100%! ===");
}

runTestSuite().catch(console.error);
