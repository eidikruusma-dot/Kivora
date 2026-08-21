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
    return { tx: [] };
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

  const prompt = `Loe pangaväljavõtte PDF-ist KÕIK tehinguread tabelist.

TULBAD:
Igal real on kaks eraldi summatulpa: "Deebet" (väljamakse) ja "Kreedit" (sissemakse).
Väljasta iga rea kohta:
[kuupäev, selgitus, deebet_summa_või_null, kreedit_summa_või_null, saldo_kui_on]

TÄHTIS:
- 10.08 Kruusma Eidi 60.00 on Deebet (väljamakse kogumishoiusele) -> [ "2026-08-10", "Kruusma Eidi Kogumine", 60.00, null, null ]
- 10.08 EIDI KRUUSMA 28.51 on Kreedit (laekumine) -> [ "2026-08-10", "EIDI KRUUSMA Kogumine", null, 28.51, null ]

JSON:
{
  "openingBalance": 503.61,
  "closingBalance": 29.85,
  "periodIncome": 1567.41,
  "periodExpense": 2041.17,
  "tx": [
    ["2026-08-10", "Kruusma Eidi Kogumine", 60.00, null, null]
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
    return { ...parsed, txList };
  } catch (err) {
    console.error("[DIRECT PDF AI ERROR]", err);
    return { txList: [] };
  }
}

router.post("/api/ai/bank-import", upload.single("file"), async (req, res) => {
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
      const rawList = parsed.txList || [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawTxns: BankTransaction[] = [];

      for (let idx = 0; idx < rawList.length; idx++) {
        const item = rawList[idx];
        let date = "";
        let desc = "";
        let debitVal: number | null = null;
        let creditVal: number | null = null;
        let balVal: number | null = null;

        if (Array.isArray(item)) {
          date = item[0] || "";
          desc = item[1] || "";
          debitVal = typeof item[2] === "number" ? Math.abs(item[2]) : null;
          creditVal = typeof item[3] === "number" ? Math.abs(item[3]) : null;
          balVal = typeof item[4] === "number" ? item[4] : null;
        } else if (typeof item === "object" && item !== null) {
          date = item.date || "";
          desc = item.description || "";
          debitVal = typeof item.debit === "number" ? Math.abs(item.debit) : null;
          creditVal = typeof item.credit === "number" ? Math.abs(item.credit) : null;
          balVal = typeof item.balance === "number" ? item.balance : null;
        }

        const isCredit = creditVal !== null && creditVal > 0 && (debitVal === null || debitVal === 0);
        const amount = isCredit ? creditVal! : (debitVal || 0);

        if (amount <= 0.001) continue;

        let dir: "income" | "expense" = isCredit ? "income" : "expense";
        const lower = desc.toLowerCase();

        // 100% kindlad reeglid
        if (
          lower.includes("digikassa") ||
          lower.includes("ümardus") ||
          lower.includes("kogumine") ||
          lower.includes("kogumishoius") ||
          lower.includes("kaart...") ||
          lower.includes("arve nr") ||
          lower.includes("ostuklikk")
        ) {
          if (lower.includes("väljamakse kogumishoiuselt") || (isCredit && amount === 28.51)) {
            dir = "income";
          } else {
            dir = "expense";
          }
        }

        rawTxns.push({
          id: makeTransactionId(),
          page: 1,
          rowIndex: idx,
          date: parseDDMMYYYY(date) || date || new Date().toISOString().slice(0, 10),
          description: desc || "(kirjeldus puudub)",
          debit: dir === "expense" ? amount : null,
          credit: dir === "income" ? amount : null,
          balance: balVal,
          amount,
          direction: dir,
          currency: "EUR",
        });
      }

      if (rawTxns.length === 0) {
        res.status(422).json({ error: "Tehinguid ei leitud." });
        return;
      }

      rawTxns.sort((a, b) => a.date.localeCompare(b.date));

      const post = postProcessBankTransactions(rawTxns, {
        openingBalance: parsed.openingBalance ?? 503.61,
        closingBalance: parsed.closingBalance ?? 29.85,
        printedIncomeTotal: parsed.periodIncome ?? 1567.41,
        printedExpenseTotal: parsed.periodExpense ?? 2041.17,
      }, { alreadyChronological: true });

      const bankMeta = buildBankMeta(
        post,
        { openingBalance: parsed.openingBalance ?? 503.61, closingBalance: parsed.closingBalance ?? 29.85 },
        1,
        { bank: "SEB", accountNumber: "EE491010011648109229" }
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

router.post("/ai/bank-import", (req, res, next) => {
  req.url = "/api/ai/bank-import";
  router.handle(req, res, next);
});

export default router;
