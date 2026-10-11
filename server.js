
const express = require("express");

const app = express();
app.use(express.json({ limit: "30kb" }));

app.get("/", (req, res) => {
  res.send("Genie AI server is running!");
});

// Chuẩn hóa câu hỏi để phát hiện câu trùng.
function normalizeQuestion(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// So sánh nội dung câu hỏi, không chỉ so sánh nguyên văn.
function isRepeatedQuestion(question, previousQuestions) {
  const current = normalizeQuestion(question);

  if (!current) return true;

  const currentWords = new Set(current.split(" "));

  return previousQuestions.some(oldQuestion => {
    const old = normalizeQuestion(oldQuestion);

    if (!old) return false;
    if (current === old) return true;

    const oldWords = new Set(old.split(" "));
    const common = [...currentWords]
      .filter(word => oldWords.has(word)).length;

    const similarity =
      common / Math.max(currentWords.size, oldWords.size, 1);

    return similarity >= 0.75;
  });
}

// Lấy câu hỏi cũ từ lịch sử Roblox gửi lên.
function extractPreviousQuestions(history) {
  const questions = [];

  function scan(value) {
    if (Array.isArray(value)) {
      value.forEach(scan);
      return;
    }

    if (!value || typeof value !== "object") return;

    for (const [key, child] of Object.entries(value)) {
      if (
        typeof child === "string" &&
        /question|câu hỏi/i.test(key)
      ) {
        questions.push(child);
      } else if (child && typeof child === "object") {
        scan(child);
      }
    }
  }

  scan(history);
  return [...new Set(questions)];
}

app.post("/ask", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Missing GEMINI_API_KEY"
      });
    }

    const history = Array.isArray(req.body.history)
      ? req.body.history.slice(-40)
      : [];

    const previousQuestions =
      extractPreviousQuestions(history);

    // Thử tối đa 3 lần để tìm câu hỏi mới.
    for (let questionAttempt = 0; questionAttempt < 3; questionAttempt++) {
      const retryNote = questionAttempt > 0
        ? `
CẢNH BÁO: Câu hỏi vừa tạo bị trùng hoặc quá giống câu cũ.
Hãy nghĩ một câu hỏi KHÁC HẲN về một đặc điểm khác.
Nếu không có câu hỏi hữu ích mới, hãy đưa ra dự đoán tốt nhất.
`
        : "";

      const prompt = `
Bạn là thần đèn AI đoán mọi thứ như Akinator.

Người chơi có thể nghĩ về người thật, người nổi tiếng quốc tế,
nhân vật hư cấu, anime, phim, game, động vật, đồ vật,
địa điểm hoặc bất cứ thứ gì bạn biết.

LỊCH SỬ TRÒ CHƠI:
${JSON.stringify(history)}

CÁC CÂU HỎI ĐÃ ĐƯỢC HỎI:
${JSON.stringify(previousQuestions)}

QUY TẮC BẮT BUỘC:
1. Đọc kỹ lịch sử và tất cả câu trả lời trước đó.
2. Tuyệt đối không hỏi lại câu cũ.
3. Không hỏi câu có cùng ý nghĩa với câu cũ dù đổi vài từ.
4. Không hỏi lại điều đã được xác định bởi câu trả lời trước.
5. Mỗi câu hỏi phải tìm hiểu một đặc điểm mới.
6. Ưu tiên câu hỏi giúp phân biệt nhiều đáp án có khả năng.
7. Chỉ hỏi MỘT câu ngắn, rõ ràng bằng tiếng Việt.
8. Khi đủ dữ kiện, hãy đoán tên cụ thể nhất có thể.
9. Không tự bịa câu trả lời của người chơi.
10. Nếu khó nghĩ ra câu hỏi mới, hãy đoán đáp án tốt nhất.

${retryNote}

Chỉ trả về một JSON hợp lệ, không thêm Markdown.

Hỏi:
{"type":"question","question":"Câu hỏi tiếng Việt"}

Đoán:
{"type":"guess","guess":"Tên đáp án"}
`;

      let response;
      let data;

      // Gọi Gemini, thử lại khi dịch vụ tạm thời quá tải.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
              },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [{
                    text: `
Bạn là thần đèn AI.
Trả về đúng một JSON object hợp lệ.
Câu hỏi bằng tiếng Việt.
Không lặp câu hỏi cũ.
`
                  }]
                },
                contents: [{
                  role: "user",
                  parts: [{ text: prompt }]
                }],
                generationConfig: {
                  responseMimeType: "application/json",
                  temperature: 0.7,
                  maxOutputTokens: 500
                }
              }),
              signal: AbortSignal.timeout(20000)
            }
          );

          data = await response.json();
        } catch (networkError) {
          console.error(
            "Gemini connection error:",
            networkError.message
          );

          if (attempt < 2) {
            await new Promise(resolve =>
              setTimeout(resolve, 1000 * (attempt + 1))
            );
            continue;
          }

          return res.status(502).json({
            error: "Could not connect to Gemini"
          });
        }

        if (response.ok) break;

        console.error("Gemini API error:", response.status, data);

        if (
          ![429, 500, 502, 503, 504].includes(response.status) ||
          attempt === 2
        ) {
          return res.status(502).json({
            error: "Gemini API request failed",
            status: response.status
          });
        }

        await new Promise(resolve =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
      }

      if (!response || !response.ok) {
        return res.status(502).json({
          error: "Gemini is temporarily unavailable"
        });
      }

      const candidate = data.candidates?.[0];
      const output = candidate?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

      if (!output) {
        return res.status(502).json({
          error: "Gemini returned no answer"
        });
      }

      let result;

      try {
        result = JSON.parse(output);
      } catch {
        console.error("Invalid Gemini JSON:", output);

        return res.status(502).json({
          error: "Gemini returned invalid JSON"
        });
      }

      if (result.type === "guess" && result.guess) {
        return res.json({
          type: "guess",
          guess: String(result.guess)
        });
      }

      if (result.type === "question" && result.question) {
        const question = String(result.question).trim();

        if (
          isRepeatedQuestion(question, previousQuestions)
        ) {
          console.log(
            "Repeated question rejected:",
            question
          );

          // Không gửi câu trùng về Roblox.
          previousQuestions.push(question);
          continue;
        }

        return res.json({
          type: "question",
          question
        });
      }

      return res.status(502).json({
        error: "Gemini returned an unexpected response"
      });
    }

    // Không hỏi lại nếu đã thử mà vẫn không có câu mới.
    return res.json({
      type: "guess",
      guess: "Mình chưa đủ dữ kiện để đoán chính xác. Bạn thử chơi ván mới nhé!"
    });

  } catch (error) {
    console.error("Genie server error:", error.message);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Genie AI server is running on port " + PORT);
});
