
const express = require("express");

const app = express();
app.use(express.json({ limit: "30kb" }));

app.get("/", (req, res) => {
  res.send("Genie AI server is running!");
});

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

    const prompt = `
You are a clever guessing genie like Akinator.
The player can think of any person, fictional character,
animal, object, place, game character, or other thing.

Use the game history to narrow down the possibilities.
Ask one short, clear yes/no question in Vietnamese at a time.
Do not repeat questions already asked.
When there is enough evidence, make your best guess.
If evidence is weak, ask another question.

Return one complete JSON object only.
For a question:
{"type":"question","question":"Câu hỏi bằng tiếng Việt"}
For a guess:
{"type":"guess","guess":"Tên thứ bạn đoán bằng tiếng Việt"}

Game history:
${JSON.stringify(history)}
`;

    let response;
    let data;

    // Retry up to 3 times if Gemini is temporarily busy.
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
                  text: "You are an AI guessing genie. Return only one complete valid JSON object with either type question and question, or type guess and guess. Write questions in Vietnamese."
                }]
              },
              contents: [{
                role: "user",
                parts: [{ text: prompt }]
              }],
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.4,
                maxOutputTokens: 500
              }
            }),
            signal: AbortSignal.timeout(20000)
          }
        );

        data = await response.json();
      } catch (networkError) {
        console.error("Gemini connection error:", networkError.message);

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

      if (response.ok) {
        break;
      }

      console.error(
        "Gemini API error:",
        response.status,
        data
      );

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
      console.error(
        "Gemini returned no text:",
        JSON.stringify(data)
      );

      return res.status(502).json({
        error: "Gemini returned no answer"
      });
    }

    let result;

    try {
      result = JSON.parse(output);
    } catch (parseError) {
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
      return res.json({
        type: "question",
        question: String(result.question)
      });
    }

    return res.status(502).json({
      error: "Gemini returned an unexpected response"
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
