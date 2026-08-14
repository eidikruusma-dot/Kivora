// src/scripts/test-openai-pdf.ts
import { PDFDocument, StandardFonts } from "pdf-lib";
import OpenAI, { toFile } from "openai";
var openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
async function buildSyntheticBankStatementPdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const draw = (text, x, y, size = 10) => {
    page.drawText(text, { x, y, size, font });
  };
  draw("BANK STATEMENT", 200, 800, 14);
  draw("Account: EE12 3456 7890 1234 5678", 50, 770);
  draw("Period: 01.08.2026 - 31.08.2026", 50, 750);
  draw("Opening Balance                          500.00", 50, 720);
  draw("Date        Description     Debit  Credit  Balance", 50, 690);
  draw("01.08.2026  Test Expense    25.50          474.50", 50, 670);
  draw("02.08.2026  Test Income            100.00  574.50", 50, 650);
  draw("Total Debits  25.50", 50, 620);
  draw("Total Credits 100.00", 50, 600);
  draw("Closing Balance                          574.50", 50, 570);
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
function logResponseMetadata(label, response) {
  if (!response || typeof response !== "object") {
    console.log(`[${label}] response is not an object:`, typeof response);
    return;
  }
  const r = response;
  const outputTextLen = typeof r.output_text === "string" ? r.output_text.length : -1;
  const outputArr = Array.isArray(r.output) ? r.output : [];
  const outputTypes = [
    ...new Set(
      outputArr.map((item) => {
        if (!item || typeof item !== "object") return "unknown";
        return item.type ?? "no-type";
      }).map(String)
    )
  ];
  const contentTypes = [];
  for (const item of outputArr) {
    if (!item || typeof item !== "object") continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object") {
        const ptype = part.type;
        if (typeof ptype === "string") contentTypes.push(ptype);
      }
    }
  }
  const status = typeof r.status === "string" ? r.status : null;
  const error = r.error && typeof r.error === "object" ? r.error : null;
  const incompleteDetails = r.incomplete_details && typeof r.incomplete_details === "object" ? r.incomplete_details : null;
  let jsonParseOk = false;
  if (typeof r.output_text === "string" && r.output_text.trim()) {
    try {
      JSON.parse(r.output_text);
      jsonParseOk = true;
    } catch {
    }
  }
  console.log(`[${label}]`);
  console.log(`  output_text length:  ${outputTextLen >= 0 ? outputTextLen : "not present"}`);
  console.log(`  output item count:   ${outputArr.length}`);
  console.log(`  output item types:   ${outputTypes.length > 0 ? outputTypes.join(", ") : "none"}`);
  console.log(`  content types:       ${contentTypes.length > 0 ? contentTypes.join(", ") : "none"}`);
  console.log(`  response status:     ${status ?? "not present"}`);
  console.log(`  json parse ok:       ${jsonParseOk}`);
  console.log(`  error:               ${error ? JSON.stringify(error).slice(0, 200) : "none"}`);
  console.log(`  incomplete_details:  ${incompleteDetails ? JSON.stringify(incompleteDetails).slice(0, 200) : "none"}`);
  console.log(`  keys on response:    ${Object.keys(r).join(", ")}`);
}
async function run() {
  console.log("=== OpenAI PDF Integration Test ===");
  console.log("openai package: v7.x (installed)");
  const pdfBuffer = await buildSyntheticBankStatementPdf();
  console.log(`Synthetic PDF: ${pdfBuffer.length} bytes`);
  let uploadedFileId = null;
  try {
    const uploaded = await openai.files.create({
      file: await toFile(pdfBuffer, "test-statement.pdf", {
        type: "application/pdf"
      }),
      purpose: "user_data"
    });
    uploadedFileId = uploaded.id;
    console.log(`File uploaded: id present = ${!!uploadedFileId}`);
  } catch (err) {
    const e = err;
    console.error("File upload FAILED:", {
      name: e?.name,
      status: e?.status,
      code: e?.code,
      type: e?.type,
      message: typeof e?.message === "string" ? e.message.slice(0, 300) : e?.message
    });
    process.exit(1);
  }
  console.log("\n--- Test A: file_id + simple prompt (no format constraint) ---");
  try {
    const responseA = await openai.responses.create({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", file_id: uploadedFileId },
            {
              type: "input_text",
              text: 'How many transactions are in this document? Reply with only: {"transaction_count": N}'
            }
          ]
        }
      ],
      temperature: 0,
      max_output_tokens: 256
    });
    logResponseMetadata("A no-schema", responseA);
  } catch (err) {
    const e = err;
    console.error("Test A FAILED:", {
      name: e?.name,
      status: e?.status,
      code: e?.code,
      type: e?.type,
      message: typeof e?.message === "string" ? e.message.slice(0, 300) : e?.message
    });
  }
  console.log("\n--- Test B: file_id + json_object format ---");
  try {
    const responseB = await openai.responses.create({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", file_id: uploadedFileId },
            {
              type: "input_text",
              text: 'Is this a bank statement? Reply JSON: {"is_bank_statement": true/false, "transaction_count": N}'
            }
          ]
        }
      ],
      text: { format: { type: "json_object" } },
      temperature: 0,
      max_output_tokens: 256
    });
    logResponseMetadata("B json_object", responseB);
  } catch (err) {
    const e = err;
    console.error("Test B FAILED:", {
      name: e?.name,
      status: e?.status,
      code: e?.code,
      type: e?.type,
      message: typeof e?.message === "string" ? e.message.slice(0, 300) : e?.message
    });
  }
  console.log("\n--- Test C: file_id + json_schema strict (current production approach) ---");
  try {
    const responseC = await openai.responses.create({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", file_id: uploadedFileId },
            {
              type: "input_text",
              text: "Extract bank statement data."
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "bank_statement",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["isBankStatement", "transactionCount"],
            properties: {
              isBankStatement: { type: "boolean" },
              transactionCount: { type: "integer" }
            }
          }
        }
      },
      temperature: 0,
      max_output_tokens: 256
    });
    logResponseMetadata("C json_schema strict", responseC);
  } catch (err) {
    const e = err;
    console.error("Test C FAILED:", {
      name: e?.name,
      status: e?.status,
      code: e?.code,
      type: e?.type,
      message: typeof e?.message === "string" ? e.message.slice(0, 300) : e?.message
    });
  }
  if (uploadedFileId) {
    try {
      await openai.files.delete(uploadedFileId);
      console.log("\nFile deleted: OK");
    } catch {
      console.log("\nFile delete: FAILED (non-fatal)");
    }
  }
}
run().catch((err) => {
  const e = err;
  console.error("Uncaught:", {
    name: e?.name,
    message: typeof e?.message === "string" ? e.message.slice(0, 300) : e?.message
  });
  process.exit(1);
});
