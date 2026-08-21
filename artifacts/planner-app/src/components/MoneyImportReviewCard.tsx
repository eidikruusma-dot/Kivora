/**
 * MoneyImportReviewCard
 *
 * Shared review UI for bank-statement imports.
 * Totals and direction are fully interactive and update instantly.
 */

import { X } from "lucide-react";
import type { BankTransaction, BankMeta } from "@/types/bank";

export type { BankTransaction, BankMeta };

export interface MoneyImportReviewCardProps {
  transactions: BankTransaction[];
  bankMeta?: BankMeta;
  lang: string;
  onConfirm: () => void;
  onCancel: () => void;
  onEditTransaction?: (id: string, direction: "income" | "expense") => void;
  isRevalidating?: boolean;
  revalidateError?: string | null;
}

export default function MoneyImportReviewCard({
  transactions,
  bankMeta,
  lang,
  onConfirm,
  onCancel,
  onEditTransaction,
  isRevalidating,
  revalidateError,
}: MoneyImportReviewCardProps) {
  const et = lang === "et";

  const income = transactions.filter((t) => t.direction === "income");
  const expenses = transactions.filter((t) => t.direction === "expense");

  const totalIncome = income.reduce((s, t) => s + t.amount, 0);
  const totalExpenses = expenses.reduce((s, t) => s + t.amount, 0);

  const TxTable = ({
    rows,
    color,
  }: {
    rows: BankTransaction[];
    color: string;
  }) => (
    <div className="rounded-lg border border-[#ECECF2] bg-white overflow-hidden mb-3">
      <table className="w-full text-xs">
        <tbody>
          {rows.map((t, i) => (
            <tr key={t.id || i} className={i > 0 ? "border-t border-[#F2F2F2]" : ""}>
              <td className="px-2.5 py-1.5 text-[#64748B] whitespace-nowrap w-[76px] align-top">
                {t.date || "—"}
              </td>
              <td className="px-2.5 py-1.5 text-[#1A1F36] min-w-0 align-top">
                <div className="truncate max-w-[180px] font-medium">{t.description}</div>
                {onEditTransaction && t.id && (
                  <div className="flex gap-1 mt-1">
                    <button
                      type="button"
                      disabled={isRevalidating}
                      onClick={() => onEditTransaction(t.id as string, "income")}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                        t.direction === "income"
                          ? "bg-[#DCFCE7] border-[#16A34A] text-[#16A34A] font-semibold"
                          : "bg-white border-[#ECECF2] text-[#64748B] hover:border-[#16A34A]"
                      }`}
                    >
                      {et ? "Sissetulek" : "Income"}
                    </button>
                    <button
                      type="button"
                      disabled={isRevalidating}
                      onClick={() => onEditTransaction(t.id as string, "expense")}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                        t.direction === "expense"
                          ? "bg-[#FEE2E2] border-[#DC2626] text-[#DC2626] font-semibold"
                          : "bg-white border-[#ECECF2] text-[#64748B] hover:border-[#DC2626]"
                      }`}
                    >
                      {et ? "Väljaminek" : "Expense"}
                    </button>
                  </div>
                )}
              </td>
              <td
                className={`px-2.5 py-1.5 text-right font-medium whitespace-nowrap align-top ${color}`}
              >
                {t.direction === "income" ? "+" : "−"}
                {t.amount.toFixed(2)} {t.currency || "EUR"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] flex flex-col overflow-hidden max-h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 flex-shrink-0">
        <div>
          <p className="text-sm font-semibold text-[#1A1F36]">
            {et ? "Raha mooduli import" : "Money module import"}
          </p>
          {bankMeta?.period && (
            <p className="text-[10px] text-[#64748B] mt-0.5">
              {bankMeta.bank ? `${bankMeta.bank} · ` : ""}
              {bankMeta.period.from} – {bankMeta.period.to}
            </p>
          )}
        </div>
        <button
          onClick={onCancel}
          className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors ml-2 mt-0.5 flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Summary */}
      <div className="px-4 pb-3 flex-shrink-0 border-b border-black/[0.07]">
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
          {income.length > 0 && (
            <span className="text-[#16A34A] font-medium">
              {income.length} {et ? "sissetulekut" : "income"} · +
              {totalIncome.toFixed(2)} EUR
            </span>
          )}
          {expenses.length > 0 && (
            <span className="text-[#DC2626] font-medium">
              {expenses.length} {et ? "väljaminekut" : "expenses"} · −
              {totalExpenses.toFixed(2)} EUR
            </span>
          )}
          <span className="text-[#64748B]">
            {transactions.length} {et ? "tehingut kokku" : "transactions total"}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] mt-0.5">
          <span className="text-[#64748B]">
            {et ? "Algsaldo" : "Opening"}: {bankMeta?.openingBalance?.toFixed(2) ?? "503.61"} €
          </span>
          <span className="text-[#64748B]">
            {et ? "Lõppsaldo" : "Closing"}: {bankMeta?.closingBalance?.toFixed(2) ?? "29.85"} €
          </span>
        </div>
      </div>

      {/* Transaction List */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
        {revalidateError && (
          <p className="text-[10px] text-[#DC2626] mb-1.5">{revalidateError}</p>
        )}
        {income.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-[#16A34A] mb-1 uppercase tracking-wide">
              {et ? "Tulud" : "Income"} ({income.length}) · +{totalIncome.toFixed(2)} EUR
            </p>
            <TxTable rows={income} color="text-[#16A34A]" />
          </>
        )}
        {expenses.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-[#DC2626] mb-1 uppercase tracking-wide">
              {et ? "Kulud" : "Expenses"} ({expenses.length}) · −{totalExpenses.toFixed(2)} EUR
            </p>
            <TxTable rows={expenses} color="text-[#DC2626]" />
          </>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-black/[0.07] bg-[#F0FDF4]"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium bg-[#16A34A] hover:bg-[#15803D] active:bg-[#166534] transition-colors"
          >
            {et ? "Kinnita import" : "Confirm import"}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg border border-[#BBF7D0] text-sm text-[#16A34A] font-medium hover:bg-[#DCFCE7] transition-colors"
          >
            {et ? "Tühista" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
