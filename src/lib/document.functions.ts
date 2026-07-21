import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  dataUrl: z.string().min(20), // data:...;base64,...
});

export type DocumentType =
  | "Real Property Appraisal Notice"
  | "BPP Rendition Form"
  | "BPP Appraisal Notice"
  | "Tax Bill / Statement"
  | "Hearing Notice / ARB"
  | "Refund Notice"
  | "EPIN / PIN Notice"
  | "Exemption Notice"
  | "Other";

export type Extraction = {
  documentType: DocumentType;
  ownerName: string | null;
  propertyName: string | null;
  propertyAddress: string | null;
  situsAddress: string | null;
  county: string | null;
  cadName: string | null;
  accountNumber: string | null;
  parcelId: string | null;
  taxYear: number | null;
  noticeValue: number | null;
  landValue: number | null;
  improvementValue: number | null;
  bppValue: number | null;
  priorValue: number | null;
  noticeDate: string | null;
  mailDate: string | null;
  protestDeadline: string | null;
  hearingDate: string | null;
  paymentDueDate: string | null;
  taxAmountDue: number | null;
  pinOrEpin: string | null;
  exemptions: string[] | null;
  confidence: number; // 0-1
  reasoning: string | null;
};

const SYSTEM = `You are a Texas property tax document classifier. The user uploads one document image or PDF page from a Texas County Appraisal District (CAD) or tax office. Extract fields precisely.

Rules:
- Never invent values. If a field is not clearly visible, return null.
- Money values are numbers (no commas, no $).
- Dates in ISO YYYY-MM-DD format.
- documentType must be one of: "Real Property Appraisal Notice", "BPP Rendition Form", "BPP Appraisal Notice", "Tax Bill / Statement", "Hearing Notice / ARB", "Refund Notice", "EPIN / PIN Notice", "Exemption Notice", "Other".
- confidence is a single 0..1 score for the overall extraction quality (OCR clarity + completeness of key fields).
- Return ONLY a JSON object matching the schema. No prose.`;

const SCHEMA_HINT = `{"documentType":"...","ownerName":null,"propertyName":null,"propertyAddress":null,"situsAddress":null,"county":null,"cadName":null,"accountNumber":null,"parcelId":null,"taxYear":null,"noticeValue":null,"landValue":null,"improvementValue":null,"bppValue":null,"priorValue":null,"noticeDate":null,"mailDate":null,"protestDeadline":null,"hearingDate":null,"paymentDueDate":null,"taxAmountDue":null,"pinOrEpin":null,"exemptions":null,"confidence":0.0,"reasoning":null}`;

export const classifyDocument = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<Extraction> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const isImage = data.mimeType.startsWith("image/");
    const contentBlock = isImage
      ? { type: "image_url", image_url: { url: data.dataUrl } }
      : {
          type: "file",
          file: { filename: data.fileName, file_data: data.dataUrl },
        };

    const body = {
      model: "google/gemini-3.6-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Classify and extract this Texas property tax document. Return JSON in this exact shape (nulls where unknown):\n${SCHEMA_HINT}`,
            },
            contentBlock,
          ],
        },
      ],
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("AI is rate-limited. Please retry in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Contact your workspace admin.");
      throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: Partial<Extraction>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // best-effort: pull the first {...} block
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? (JSON.parse(m[0]) as Partial<Extraction>) : {};
    }

    return {
      documentType: (parsed.documentType as DocumentType) ?? "Other",
      ownerName: parsed.ownerName ?? null,
      propertyName: parsed.propertyName ?? null,
      propertyAddress: parsed.propertyAddress ?? null,
      situsAddress: parsed.situsAddress ?? null,
      county: parsed.county ?? null,
      cadName: parsed.cadName ?? null,
      accountNumber: parsed.accountNumber ?? null,
      parcelId: parsed.parcelId ?? null,
      taxYear: parsed.taxYear ?? null,
      noticeValue: parsed.noticeValue ?? null,
      landValue: parsed.landValue ?? null,
      improvementValue: parsed.improvementValue ?? null,
      bppValue: parsed.bppValue ?? null,
      priorValue: parsed.priorValue ?? null,
      noticeDate: parsed.noticeDate ?? null,
      mailDate: parsed.mailDate ?? null,
      protestDeadline: parsed.protestDeadline ?? null,
      hearingDate: parsed.hearingDate ?? null,
      paymentDueDate: parsed.paymentDueDate ?? null,
      taxAmountDue: parsed.taxAmountDue ?? null,
      pinOrEpin: parsed.pinOrEpin ?? null,
      exemptions: parsed.exemptions ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reasoning: parsed.reasoning ?? null,
    };
  });

const AskInput = z.object({
  question: z.string().min(1).max(500),
  context: z.string().max(4000).optional(),
});

export const askAboutDocument = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AskInput.parse(d))
  .handler(async ({ data }): Promise<{ answer: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content:
              "You are CorvusRF's Texas property tax assistant. Answer briefly and accurately. If unsure, say so. Do not invent numbers.",
          },
          {
            role: "user",
            content: `Document context (extracted JSON):\n${data.context ?? "(none)"}\n\nQuestion: ${data.question}`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { answer: j.choices?.[0]?.message?.content ?? "No response." };
  });
