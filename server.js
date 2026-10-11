javascript
const express = require("express");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "Genie AI Server is running!" });
});

app.post("/ask", (req, res) => {
  const history = req.body.history || [];

  const questions = [
    "Nhân vật đó có thật ngoài đời không?",
    "Nhân vật đó nổi tiếng trên Internet không?",
    "Nhân vật đó thuộc anime hoặc hoạt hình không?",
    "Nhân vật đó xuất hiện trong trò chơi không?"
  ];

  res.json({
    question: questions[history.length % questions.length]
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Genie AI server running on port " + PORT);
});
