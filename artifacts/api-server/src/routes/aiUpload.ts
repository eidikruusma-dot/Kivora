import { Router } from "express";
import multer from "multer";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import { postProcessBankTransactions } from "../lib/postProcessBankTransactions";
import type { BankPostProcessResult } from "../lib/postProcessBankTransactions";
import { parseBankFile } from "../lib/parseBankCsv";
import { extractStructuralPdfBuffer } from "../lib/extractStructuralPdfBuffer";
import type { RawTransactionRow } from "../lib/classifyTransactionRows";

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

interface BankPdfResult {
  isBankStatement: boolean;
  transactions?: BankTransaction[];
  bankMeta?: BankMeta;
  plainText: string;
  usedOCR: boolean;
}

function makeTransactionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizePdfText(raw: string): string {
  return (raw || "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD\uFFFE\uFFFF\uE000-\uF8FF\u2500-\u25FF]/g, "")
    .replace(/--\s*\d+\s*of\s*\d+\s*--/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parserFn: any = (pdfParse as any).default || pdfParse;
    const data = await parserFn(buffer);
    return sanitizePdfText(data?.text || "");
  } catch (e) {
    console.error("[PDF PARSE ERROR]", e);
    return "";
  }
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

function rawRowToBankTransaction(row: RawTransactionRow, idx: number): BankTransaction {
  const debitAmt = row.debit !== null && row.debit > 0 ? row.debit : null;
  const creditAmt = row.credit !== null && row.credit > 0 ? row.credit : null;

  let amount = 0;
  let direction: "income" | "expense" = "expense";
  const reasons: string[] = [];

  if (debitAmt !== null && creditAmt === null) {
    amount = debitAmt;
    direction = "expense";
  } else if (creditAmt !== null && debitAmt === null) {
    amount = creditAmt;
    direction = "income";
  } else if (debitAmt !== null && creditAmt !== null) {
    amount = Math.max(debitAmt, creditAmt);
    direction = debitAmt >= creditAmt ? "expense" : "income";
    reasons.push("Mõlemad veerud täidetud");
  } else {
    reasons.push("Summa puudub");
  }

  return {
    id: makeTransactionId(),
    page: row.pageNumber || 1,
    rowIndex: row.rowIndex ?? idx,
    date: parseDDMMYYYY(row.date) ?? row.date,
    description: row.description || "(kirjeldus puudub)",
    debit: debitAmt,
    credit: creditAmt,
    balance: row.balance,
    amount,
    direction,
    currency: "EUR",
    ...(row.pending && { pending: true }),
    ...(reasons.length > 0 && { needsReview: true, reviewReason: reasons.join("; ") }),
  };
}

export function buildBankMeta(
  post: BankPostProcessResult<BankTransaction>,
  controls: { openingBalance: number | null; closingBalance: number | null; printedIncomeTotal?: number | null; printedExpenseTotal?: number | null },
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
    summaryIncome: controls.printedIncomeTotal ?? undefined,
    summaryExpenses: controls.printedExpenseTotal ?? undefined,
    pagesTotal,
    pagesProcessed: pagesTotal,
    incomeCount: post.incomeCount,
    expenseCount: post.expenseCount,
    calculatedIncomeTotal: post.calculatedIncomeTotal,
    calculatedExpenseTotal: post.calculatedExpenseTotal,
    validationStatus: post.validationStatus,
    importAllowed: post.importAllowed,
    validationErrors: post.validationErrors,
  };
}

async function extractBankStatementViaAI(text: string): Promise<BankPdfResult> {
  const prompt = `Analüüsi seda pangaväljavõtte teksti.
Ülesanded:
1. Tuvasta algsaldo (openingBalance) ja lõppsaldo (closingBalance).
2. Tuvasta KÕIK tehingud ja pane need rangelt KRONOLOOGILISSE järjekorda (alt üles: algsaldost alates kuni lõppsaldoni).
3. Eralda tehingul kuupäev, selgitus/saaja, deebet (kulu), kreedit (tulu) ja jooksev saldo.

Tagasta AINULT puhas JSON järgmises struktuuris:
{
  "bankName": "string või null",
  "accountNumber": "string või null",
  "openingBalance": 0.00,
  "closingBalance": 0.00,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "selgitus",
      "debit": 12.34,
      "credit": null,
      "balance": 100.00,
      "currency": "EUR"
    }
  ]
}

Dokumendi tekst:
${text.slice(0, 60000)}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Oled professionaalne pangaväljavõtete analüüsija. Tagastad alati puhta JSON-objekti." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawTxns: BankTransaction[] = (parsed.transactions || []).map((t: any, idx: number) => {
    const isCredit = typeof t.credit === "number" && t.credit > 0;
    const isDebit = typeof t.debit === "number" && t.debit > 0;
    const amount = isCredit ? t.credit : isDebit ? t.debit : 0;
    return {
      id: makeTransactionId(),
      page: 1,
      rowIndex: idx,
      date: parseDDMMYYYY(t.date) || t.date || "",
      description: t.description || "(kirjeldus puudub)",
      debit: isDebit ? t.debit : null,
      credit: isCredit ? t.credit : null,
      balance: typeof t.balance === "number" ? t.balance : null,
      amount,
      direction: isCredit ? "income" : "expense",
      currency: t.currency || "EUR",
    };
  });

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

  return {
    isBankStatement: true,
    transactions: post.transactions,
    bankMeta,
    plainText: text,
    usedOCR: true,
  };
}

async function processBankPdfBuffer(buffer: Buffer, filename: string): Promise<BankPdfResult> {
  const text = await extractPdfText(buffer);

  // 1. Struktuurne analüüs
  try {
    const structural = await extractStructuralPdfBuffer(buffer);
    if (structural && structural.transactions && structural.transactions.length > 0) {
      const rawTxns = structural.transactions.map((r, i) => rawRowToBankTransaction(r, i));
      const post = postProcessBankTransactions(rawTxns, {
        openingBalance: structural.controls.openingBalance,
        closingBalance: structural.controls.closingBalance,
        printedIncomeTotal: structural.controls.printedIncomeTotal,
        printedExpenseTotal: structural.controls.printedExpenseTotal,
      }, { alreadyChronological: true });

      const bankMeta = buildBankMeta(post, {
        openingBalance: structural.controls.openingBalance,
        closingBalance: structural.controls.closingBalance,
        printedIncomeTotal: structural.controls.printedIncomeTotal,
        printedExpenseTotal: structural.controls.printedExpenseTotal,
      }, structural.pagesTotal);

      return {
        isBankStatement: true,
        transactions: post.transactions,
        bankMeta,
        plainText: text,
        usedOCR: false,
      };
    }
  } catch (e) {
    console.warn(`[STRUCTURAL FAILED] ${filename}, minnakse AI peale:`, e);
  }

  // 2. AI analüüs
  if (text && text.trim().length > 0) {
    return await extractBankStatementViaAI(text);
  }

  return { isBankStatement: false, plainText: text, usedOCR: false };
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
      const result = await processBankPdfBuffer(file.buffer, file.originalname);
      if (!result.isBankStatement || !result.transactions || result.transactions.length === 0) {
        res.status(422).json({ error: "Tehinguid ei leitud." });
        return;
      }
      res.json({ transactions: result.transactions, bankMeta: result.bankMeta });
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

router.post("/ai/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Fail puudub." });
    return;
  }

  try {
    const isPdf = file.originalname.toLowerCase().endsWith(".pdf") || file.mimetype === "application/pdf";
    let text = "";

    if (isPdf) {
      const bankRes = await processBankPdfBuffer(file.buffer, file.originalname);
      if (bankRes.isBankStatement && bankRes.transactions && bankRes.transactions.length > 0) {
        res.json({
          content: bankRes.plainText.slice(0, 30000),
          fileName: file.originalname,
          transactions: bankRes.transactions,
          bankMeta: bankRes.bankMeta,
        });
        return;
      }
      text = bankRes.plainText;
    } else {
      text = file.buffer.toString("utf-8");
    }

    res.json({
      content: text.slice(0, 30000),
      fileName: file.originalname,
      chars: text.length,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Töötlemise viga" });
  }
});

export default router;
