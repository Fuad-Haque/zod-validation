import { z } from "zod";

// Schema 1: FORM INPUT — raw ticket submitted by the end user, before anything touches it
export const TicketInputSchema = z.object({
  customerEmail: z.string().email(),
  subject: z.string().min(3).max(200),
  body: z.string().min(10).max(5000),
});

// Schema 2: AI RESPONSE — the shape we told Claude to return, and the shape we must not trust blindly
export const AITriageSchema = z.object({
  category: z.enum(["billing", "bug", "feature_request", "account_access", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  summary: z.string().min(1).max(300),
  suggestedResponse: z.string().min(1),
});

// Schema 3: API PAYLOAD — the merged, final shape that actually gets written to the database
export const TicketRecordSchema = z.object({
  customerEmail: z.string().email(),
  subject: z.string(),
  body: z.string(),
  category: AITriageSchema.shape.category,
  priority: AITriageSchema.shape.priority,
  summary: z.string(),
  suggestedResponse: z.string(),
  createdAt: z.string().datetime(),
});