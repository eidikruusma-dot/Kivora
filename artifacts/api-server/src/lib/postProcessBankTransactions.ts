import {
  reconcileStructuralTransactions,
  roundMoney,
  differs,
  type StructuralReconciliationControls,
  type StructuralReconciliationResult,
} from "./reconcileStructuralTransactions";
import type { RawTransactionRow } from "./classifyTransactionRows";

export interface NormalizedTransaction {
  page: number;
  rowIndex: number;
  date: string;
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

export interface BankPostProcessResult<T extends NormalizedTransaction> {
  transactions: T[];
  incomeCount: number;
  expenseCount: number;
  calculatedIncomeTotal: number;
  calculatedExpenseTotal: number;
  reviewCount: number;
  importAllowed: boolean;
  validationStatus: "verified" | "unverified" | "review_required";
  validationErrors: string[];
  reconciliationOk: boolean;
  reconciliation: StructuralReconciliationResult;
}

function parseDateForSort(dateStr: string): string {
  const ddmm = dateStr.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, "0")}-${ddmm[1].padStart(2, "0")}`;
  return dateStr;
}

function sortChronologically<T extends NormalizedTransaction>(txs: T[]): T[] {
  return [...txs].sort((a, b) => {
    const da = parseDateForSort(a.date);
    const db = parseDateForSort(b.date);
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  });
}

export function reorderSameDayGroupsByBalanceChain<T extends NormalizedTransaction>(
  transactions: T[],
  openingBalance: number | null,
): T[] {
  const result: T[] = [];
  let previousBalance = openingBalance;
  let i = 0;

  while (i < transactions.length) {
    let j = i + 1;
    while (j < transactions.length && transactions[j].date === transactions[i].date) j++;
    const group = transactions.slice(i, j);

    result.push(...group);

    for (const t of group) {
      if (t.balance !== null) {
        previousBalance = t.balance;
      } else if (previousBalance !== null) {
        previousBalance = roundMoney(
          previousBalance + (t.credit ?? 0) - (t.debit ?? 0),
        );
      }
    }

    i = j;
  }

  return result;
}

export interface PostProcessOptions {
  alreadyChronological?: boolean;
}

export function postProcessBankTransactions<T extends NormalizedTransaction>(
  transactions: T[],
  controls: StructuralReconciliationControls,
  options: PostProcessOptions = {},
): BankPostProcessResult<T> {
  // 1. Sorteeri kuupäeva järgi (vanim enne, alt-ülesse loogika)
  const dateSorted = options.alreadyChronological
    ? transactions
    : sortChronologically(transactions);

  const sorted = reorderSameDayGroupsByBalanceChain(
    dateSorted,
    typeof controls.openingBalance === "number" ? controls.openingBalance : null,
  );

  // 2. Kontrolli saldosid
  const adaptedForReconcile: RawTransactionRow[] = sorted.map((tx) => ({
    date: tx.date,
    description: "",
    debit: tx.debit,
    credit: tx.credit,
    balance: tx.balance,
    pageNumber: tx.page,
    rowIndex: tx.rowIndex,
    pending: tx.pending,
  }));

  const reconciliation = reconcileStructuralTransactions(
    adaptedForReconcile,
    controls,
  );

  // 3. Arvuta summad
  const incomeRows = sorted.filter((t) => t.direction === "income" && !t.pending);
  const expenseRows = sorted.filter((t) => t.direction === "expense" && !t.pending);
  const incomeCount = incomeRows.length;
  const expenseCount = expenseRows.length;
  const calculatedIncomeTotal =
    Math.round(incomeRows.reduce((s, t) => s + (t.amount || 0), 0) * 100) / 100;
  const calculatedExpenseTotal =
    Math.round(expenseRows.reduce((s, t) => s + (t.amount || 0), 0) * 100) / 100;
  const reviewCount = sorted.filter((t) => t.needsReview).length;

  const validationErrors = [...reconciliation.errors];

  return {
    transactions: sorted,
    incomeCount,
    expenseCount,
    calculatedIncomeTotal,
    calculatedExpenseTotal,
    reviewCount,
    importAllowed: true, // Lubame kasutajal tehinguid vaadata ja importida
    validationStatus: reconciliation.ok ? "verified" : "unverified",
    validationErrors,
    reconciliationOk: reconciliation.ok,
    reconciliation,
  };
}
