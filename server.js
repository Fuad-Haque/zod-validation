import "dotenv/config";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { TicketInputSchema, AITriageSchema, TicketRecordSchema } from "./schemas.js";

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Fake DB write — logs what would be persisted. Swap for real DB call in production.
function saveTicketToDatabase(record) {
  console.log("[DB WRITE]", JSON.stringify(record, null, 2));
  return { id: "ticket_" + Date.now(), ...record };
}

app.post("/tickets", async (req, res) => {
  // --- GATE 1: validate form input before it touches anything else ---
  const inputResult = TicketInputSchema.safeParse(req.body);
  if (!inputResult.success) {
    return res.status(400).json({
      error: "Invalid ticket input",
      issues: inputResult.error.issues,
    });
  }
  const ticket = inputResult.data;

  // --- Call Claude to triage the ticket ---
  let aiResponse;
  try {
    aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are a support ticket triage system. Read this ticket and respond with ONLY a JSON object, no other text, no markdown formatting, matching exactly this shape:
{"category": "billing" | "bug" | "feature_request" | "account_access" | "other", "priority": "low" | "medium" | "high" | "urgent", "summary": "one sentence summary", "suggestedResponse": "a short suggested reply to the customer"}

Ticket subject: ${ticket.subject}
Ticket body: ${ticket.body}`,
        },
      ],
    });
  } catch (e) {
    return res.status(502).json({
      error: "AI provider call failed",
      detail: e.message,
    });
  }

  const rawText = aiResponse.content[0].text;

  // --- GATE 2: parse and validate the AI's response before trusting it ---
  let parsedAI;
  try {
    parsedAI = JSON.parse(rawText);
  } catch (e) {
    return res.status(502).json({
      error: "AI returned non-JSON output",
      raw: rawText,
    });
  }

  const aiResult = AITriageSchema.safeParse(parsedAI);
  if (!aiResult.success) {
    return res.status(502).json({
      error: "AI response failed validation",
      issues: aiResult.error.issues,
      raw: parsedAI,
    });
  }
  const triage = aiResult.data;

  // --- Merge form input + AI output into the final record ---
  const candidateRecord = {
    ...ticket,
    ...triage,
    createdAt: new Date().toISOString(),
  };

  // --- GATE 3: validate the final merged payload before it hits the "database" ---
  const recordResult = TicketRecordSchema.safeParse(candidateRecord);
  if (!recordResult.success) {
    return res.status(500).json({
      error: "Final record failed validation",
      issues: recordResult.error.issues,
    });
  }

  const saved = saveTicketToDatabase(recordResult.data);
  res.status(201).json(saved);
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));