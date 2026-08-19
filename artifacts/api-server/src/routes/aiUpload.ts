import { Router } from "express";
import multer from "multer";
import OpenAI from "openai";
import { postProcessBankTransactions } from "../lib/postProcessBankTransactions";
import type { BankPostProcessResult } from "../lib/postProcessBankTransactions";
import { parseBankFile } from "../lib/parseBankCsv";

const router = Router();
const openai = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

export interface BankTransaction {
  id: string;
  page: number;
  rowIndex: number;
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  amount: number;
  direction: "income" | "expense";
  currency: string;
  needsReview?: boolean;
  reviewReason?: string;
  pending?: boolean;
}

export interface BankMeta {
  statementId: string;
  bank?: string;
  accountNumber?: string;
  period?: { from: string; to: string };
  openingBalance?: number;
  closingBalance?: number;
  summaryIncome?: number;
  summaryExpenses?: number;
  pagesTotal: number;
  pagesProcessed: number;
  incomeCount: number;
  expenseCount: number;
  calculatedIncomeTotal: number;
  calculatedExpenseTotal: number;
  validationStatus: "verified" | "unverified" | "review_required";
  importAllowed: boolean;
  validationErrors: string[];
}

function makeTransactionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseDDMMYYYY(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  const full = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(trimmed);
  if (full) {
    const day = parseInt(full[1], 10);
    const month = parseInt(full[2], 10);
    const year = parseInt(full[3], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return null;
}

function safeJsonParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    return { transactions: [] };
  }
}

export function buildBankMeta(
  post: BankPostProcessResult<BankTransaction>,
  controls: { openingBalance: number | null; closingBalance: number | null },
  pagesTotal: number,
  docMeta?: { bank?: string; period?: { from: string; to: string }; accountNumber?: string },
): BankMeta {
  return {
    statementId: makeTransactionId(),
    ...(docMeta?.bank != null && { bank: docMeta.bank }),
    ...(docMeta?.period != null && { period: docMeta.period }),
    ...(docMeta?.accountNumber != null && { accountNumber: docMeta.accountNumber }),
    openingBalance: controls.openingBalance ?? undefined,
    closingBalance: controls.closingBalance ?? undefined,
    pagesTotal,
    pagesProcessed: pagesTotal,
    incomeCount: post.incomeCount,
    expenseCount: post.expenseCount,
    calculatedIncomeTotal: post.calculatedIncomeTotal,
    calculatedExpenseTotal: post.calculatedExpenseTotal,
    validationStatus: post.validationStatus,
    importAllowed: true,
    validationErrors: post.validationErrors,
  };
}

async function extractBankPdfDirectly(buffer: Buffer, filename: string) {
  const b64 = `data:application/pdf;base64,${buffer.toString("base64")}`;

  const prompt = `Loe pangaväljavõtte PDF-ist KÕIK tehingud algusest lõpuni (kõik lehed).

Reeglid:
1. Digikassa/ümardus/kogumishoius või miinus (-) = "expense"
2. Plus (+) või laekumine = "income"
3. Järjesta vanimast uuimani.

Väljasta ülilühike ja kompaktne JSON:
{
  "openingBalance": 0.00,
  "closingBalance": 0.00,
  "bankName": "SEB",
  "accountNumber": "IBAN",
  "tx": [
    ["2026-08-01", "Selgitus/Saaja", 12.34, "expense", 500.00]
  ]
}`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await (openai as any).responses.create({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", filename, file_data: b64 },
            { type: "input_text", text: prompt },
          ],
        },
      ],
      text: { format: { type: "json_object" } },
      temperature: 0,
      max_output_tokens: 16384,
    });

    const raw = response.output_text?.trim() || "{}";
    const parsed = safeJsonParse(raw);
    const txList = Array.isArray(parsed.tx) ? parsed.tx : (parsed.transactions || []);
    console.log(`[DIRECT PDF AI] Leitud tehinguid: ${txList.length}`);
    return { ...parsed, txList };
  } catch (err) {
    console.error("[DIRECT PDF AI ERROR]", err);
    return { txList: [] };
  }
}

router.post("/ai/bank-import", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Fail puudub." });
    return;
  }

  const name = file.originalname.toLowerCase();
  const isPdf = name.endsWith(".pdf") || file.mimetype === "application/pdf";
  const isCsvOrExcel = name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls");

  try {
    if (isPdf) {
      const parsed = await extractBankPdfDirectly(file.buffer, file.originalname);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawTxns: BankTransaction[] = (parsed.txList || []).map((item: any, idx: number) => {
        let date = "";
        let desc = "";
        let amount = 0;
        let dir: "income" | "expense" = "expense";
        let bal: number | null = null;

        if (Array.isArray(item)) {
          date = item[0] || "";
          desc = item[1] || "";
          amount = typeof item[2] === "number" ? Math.abs(item[2]) : 0;
          dir = item[3] === "income" ? "income" : "expense";
          bal = typeof item[4] === "number" ? item[4] : null;
        } else if (typeof item === "object" && item !== null) {
          date = item.date || "";
          desc = item.description || "";
          amount = typeof item.amount === "number" ? Math.abs(item.amount) : (item.credit || item.debit || 0);
          dir = item.direction === "income" || (item.credit && !item.debit) ? "income" : "expense";
          bal = typeof item.balance === "number" ? item.balance : null;
        }

        const isDigikassa = desc.toLowerCase().includes("digikassa") || desc.toLowerCase().includes("ümardus");
        if (isDigikassa) dir = "expense";

        return {
          id: makeTransactionId(),
          page: 1,
          rowIndex: idx,
          date: parseDDMMYYYY(date) || date || new Date().toISOString().slice(0, 10),
          description: desc || "(kirjeldus puudub)",
          debit: dir === "expense" ? amount : null,
          credit: dir === "income" ? amount : null,
          balance: bal,
          amount,
          direction: dir,
          currency: "EUR",
        };
      });

      if (rawTxns.length === 0) {
        res.status(422).json({ error: "Tehinguid ei leitud." });
        return;
      }

      const post = postProcessBankTransactions(rawTxns, {
        openingBalance: parsed.openingBalance ?? null,
        closingBalance: parsed.closingBalance ?? null,
        printedIncomeTotal: null,
        printedExpenseTotal: null,
      }, { alreadyChronological: true });

      const bankMeta = buildBankMeta(
        post,
        { openingBalance: parsed.openingBalance ?? null, closingBalance: parsed.closingBalance ?? null },
        1,
        { bank: parsed.bankName ?? undefined, accountNumber: parsed.accountNumber ?? undefined }
      );

      res.json({ transactions: post.transactions.length > 0 ? post.transactions : rawTxns, bankMeta });
      return;
    }

    if (isCsvOrExcel) {
      const parsed = parseBankFile(file.buffer, file.originalname, file.mimetype);
      if (parsed.error || parsed.transactions.length === 0) {
        res.status(422).json({ error: parsed.error || "Tehinguid ei leitud." });
        return;
      }

      const rawTxns = parsed.transactions.map((row, idx) => {
        const isCredit = row.credit !== null && row.credit > 0;
        const amount = isCredit ? row.credit! : row.debit || 0;
        return {
          id: makeTransactionId(),
          page: 1,
          rowIndex: row.rowIndex ?? idx,
          date: row.date,
          description: row.description || "(kirjeldus puudub)",
          debit: row.debit,
          credit: row.credit,
          balance: row.balance,
          amount,
          direction: (isCredit ? "income" : "expense") as "income" | "expense",
          currency: row.currency || "EUR",
          ...(row.needsReview && { needsReview: true, reviewReason: row.reviewReason }),
          ...(row.pending && { pending: true }),
        };
      });

      const post = postProcessBankTransactions(rawTxns, {
        openingBalance: parsed.controls.openingBalance,
        closingBalance: parsed.controls.closingBalance,
        printedIncomeTotal: null,
        printedExpenseTotal: null,
      });

      const bankMeta = buildBankMeta(post, {
        openingBalance: parsed.controls.openingBalance,
        closingBalance: parsed.controls.closingBalance,
      }, 1);

      res.json({ transactions: post.transactions, bankMeta });
      return;
    }

    res.status(400).json({ error: "Toetatud on ainult PDF, CSV ja Excel failid." });
  } catch (err: any) {
    console.error("[BANK IMPORT ERROR]", err);
    res.status(500).json({ error: err.message || "Faili töötlemine ebaõnnestus." });
  }
});

export default router;
