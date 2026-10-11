const express = require("express");
const OpenAI = require("openai");

const app = express();
app.use(express.json({ limit: "30kb" }));

app.get("/", (req, res) => {
  res.send("Genie AI server is running!");
});

app.post("/ask", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY"
      });
    }

    const history = Array.isArray(req.body.history)
      ? req.body.history.slice(-40)
      : [];

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      instructions: `
You are a clever guessing genie like Akinator.
The player can think of ANY person, fictional character,
animal, object, place, game character, or other thing.

Use the previous questions and answers to narrow down
the possibilities. Ask one useful, clear yes/no question
at a time. Do not repeat questions already asked.
When you have enough evidence, make your best guess.

Return JSON only:
For a question:
{"type":"question","question":"Your question in Vietnamese"}
For a guess:
{"type":"guess","guess":"Your best guess in Vietnamese"}
Do not claim certainty when evidence is weak.
      `,
      input: "Return the answer as JSON. Here is the game history: " 
    + JSON.stringify({ history }),
      text: {
        format: { type: "json_object" }
      }
    });

    const result = JSON.parse(response.output_text);

    if (result.type === "guess" && result.guess) {
      return res.json({
        type: "guess",
        guess: result.guess
      });
    }

    return res.json({
      type: "question",
      question: result.question || "Nhân vật đó có thật ngoài đời không?"
    });
} catch (error) {
  console.error("Genie AI error:", error);
  return res.status(500).json({
    error: error.message || "AI request failed"
  });
}
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Genie AI server is running on port " + PORT);
});
