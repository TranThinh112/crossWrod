const http = require('http');

function runTest() {
  const postData = JSON.stringify({
    title: "28/10/2026",
    wordsText: `
abandon : từ bỏ
ability : khả năng
abstract : trừu tượng
academic : học thuật
accelerate : tăng tốc
accent : giọng điệu
accept : chấp nhận
access : truy cập
accident : tai nạn
accompany : đồng hành
accomplish : hoàn thành
accountant : kế toán viên
accurate : chính xác
accuse : buộc tội
achieve : đạt được
acknowledge : công nhận
acquire : tiếp thu
activity : hoạt động
adapt : thích nghi
advantage : lợi thế
    `.trim()
  });

  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/exercises/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('STATUS:', res.statusCode);
      try {
        const json = JSON.parse(body);
        console.log('SUCCESS:', json.success);
        if (json.exercise) {
          console.log('ID:', json.exercise.id);
          console.log('TITLE:', json.exercise.title);
          console.log('PLACED WORDS:', `${json.exercise.placedWords}/${json.exercise.totalWords}`);
          console.log('GRID SIZE:', `${json.exercise.width}x${json.exercise.height}`);
          console.log('ACROSS CLUES:', json.exercise.clues.across.length);
          console.log('DOWN CLUES:', json.exercise.clues.down.length);
        }
      } catch (e) {
        console.error('Response body:', body);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
  });

  req.write(postData);
  req.end();
}

runTest();
