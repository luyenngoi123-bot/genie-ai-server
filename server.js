
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

Use the previous questions and answers to narrow down
the possibilities. Ask one clear yes/no question at a time.
Do not repeat questions already asked.
When there is enough evidence, make your best guess.

Return valid JSON only, in one of these formats:
{"type":"question","question":"Your question in Vietnamese"}
{"type":"guess","guess":"Your best guess in Vietnamese"}

If evidence is weak, ask another question instead of guessing.

Game history:
${JSON.stringify(history)}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: "You are an AI guessing genie. Follow the user's requested JSON format exactly."
            }]
          },
          contents: [{
            role: "user",
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
            maxOutputTokens: 200
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", response.status, data);
      return res.status(502).json({
        error: "Gemini API request failed",
        status: response.status
      });
    }

    const output = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!output) {
      console.error("Gemini returned no text:", JSON.stringify(data));
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
        guess: result.guess
      });
    }

    if (result.question) {
      return res.json({
        type: "question",
        question: result.question
      });
    }

    return res.json({
      type: "question",
      question: "Đó có phải là một nhân vật hư cấu không?"
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
