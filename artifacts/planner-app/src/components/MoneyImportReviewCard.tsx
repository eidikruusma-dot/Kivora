/**
 * MoneyImportReviewCard
 *
 * Shared review UI for bank-statement imports.
 * Used by:
 *   - AIAssistantPage  (legacy AI-chat import path, kept intact for now)
 *   - BankImportModal in FinancePage  (new explicit Money-module import path)
 *
 * Direction comes ONLY from the server extraction pipeline — never re-derived here.
 * The Confirm button is always enabled once at least one transaction was
 * extracted; a balance mismatch or flagged row is shown as a warning, never
 * a hard block — the user decides whether to fix rows first or import anyway.
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
  /** Manually correct a flagged row's income/expense direction (e.g. a
   *  common OCR misread where the amount lands in the wrong debit/credit
   *  column) and re-run reconciliation server-side. Only wired up by the
   *  Money-module import flow — omit to keep review rows read-only
   *  (e.g. the legacy AI-chat import path). */
  onEditTransaction?: (id: string, direction: "income" | "expense") => void;
  /** True while a re-check request triggered by onEditTransaction is in flight. */
  isRevalidating?: boolean;
  /** Non-fatal error from the last re-check attempt, shown inline. */
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

  // Split using server-validated direction — never re-derive
  const income = transactions.filter(
    (t) => !t.needsReview && t.direction === "income",
  );
  const expenses = transactions.filter(
    (t) => !t.needsReview && t.direction === "expense",
  );
  const needsReview = transactions.filter((t) => t.needsReview);

  // Totals always computed in code from the validated arrays
  const totalIncome = income.reduce((s, t) => s + t.amount, 0);
  const totalExpenses = expenses.reduce((s, t) => s + t.amount, 0);

  // Validation status from the direct-extraction pipeline.
  // Older pipeline responses carry reconciliationOk/extractionComplete instead;
  // both are read for backward compat but validationStatus takes precedence.
  const validationStatus = bankMeta?.validationStatus;
  const isUnverified = validationStatus === "unverified";

  // Gate: block only when there is nothing to import at all (extraction
  // produced zero transactions) — that is the one case where confirming
  // would write nothing meaningful and likely signals a failed read.
  // A balance mismatch or flagged row no longer blocks the button: the user
  // can now manually correct flagged rows (onEditTransaction) or choose to
  // import anyway, and always sees the reconciliation warning below before
  // doing so — informed consent instead of a hard lock that repeatedly left
  // real imports permanently stuck on AI extraction noise.
  const canImport = transactions.length > 0;
  const blocked = !canImport;

  // First validation error from the pipeline, shown near the blocked button
  const blockReason = bankMeta?.validationErrors?.[0] ?? null;

  // Transaction table — no per-table scroll; parent scrollable area handles overflow
  const TxTable = ({
    rows,
    color,
    showReason,
    editable,
  }: {
    rows: BankTransaction[];
    color: string;
    showReason?: boolean;
    editable?: boolean;
  }) => (
    <div className="rounded-lg border border-[#ECECF2] bg-white overflow-hidden mb-3">
      <table className="w-full text-xs">
        <tbody>
          {rows.map((t, i) => (
            <tr key={i} className={i > 0 ? "border-t border-[#F2F2F2]" : ""}>
              <td className="px-2.5 py-1.5 text-[#64748B] whitespace-nowrap w-[76px] align-top">
                {t.date || "—"}
              </td>
              <td className="px-2.5 py-1.5 text-[#1A1F36] min-w-0 align-top">
                <div className="truncate max-w-[180px]">{t.description}</div>
                {showReason && t.reviewReason && (
                  <div className="text-[9px] text-[#F59E0B] truncate mt-0.5">
                    {t.reviewReason}
                  </div>
                )}
                {editable && t.id && onEditTransaction && (
                  <div className="flex gap-1 mt-1">
                    <button
                      type="button"
                      disabled={isRevalidating}
                      onClick={() => onEditTransaction(t.id as string, "income")}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        t.direction === "income"
                          ? "bg-[#DCFCE7] border-[#16A34A] text-[#16A34A] font-semibold"
                          : "bg-white border-[#ECECF2] text-[#64748B] hover:border-[#16A34A] hover:text-[#16A34A]"
                      }`}
                    >
                      {et ? "Sissetulek" : "Income"}
                    </button>
                    <button
                      type="button"
                      disabled={isRevalidating}
                      onClick={() => onEditTransaction(t.id as string, "expense")}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        t.direction === "expense"
                          ? "bg-[#FEE2E2] border-[#DC2626] text-[#DC2626] font-semibold"
                          : "bg-white border-[#ECECF2] text-[#64748B] hover:border-[#DC2626] hover:text-[#DC2626]"
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
                {t.amount.toFixed(2)} {t.currency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const borderBg = blocked
    ? "border-[#FCD34D] bg-[#FFFBEB]"
    : "border-[#BBF7D0] bg-[#F0FDF4]";
  const footerBg = blocked ? "bg-[#FFFBEB]" : "bg-[#F0FDF4]";

  return (
    // Card: flex-column bounded by its absolutely-positioned wrapper.
    // max-h-full = wrapper height (never exceeds it).
    // overflow-hidden clips internal content so the parent's overflow-hidden
    // cannot reach in and clip the footer.
    <div
      className={`rounded-xl border flex flex-col overflow-hidden max-h-full ${borderBg}`}
    >
      {/* ── HEADER — always visible ───────────────────────────────────────── */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 flex-shrink-0">
        <div>
          <p className="text-sm font-semibold text-[#1A1F36]">
            {et ? "Raha mooduli import" : "Money module import"}
          </p>
          {bankMeta?.period && (
            <p className="text-[10px] text-[#64748B] mt-0.5">
              {bankMeta.bank ? `${bankMeta.bank} · ` : ""}
              {bankMeta.period.from} – {bankMeta.period.to}
              {bankMeta.accountNumber
                ? ` · ${bankMeta.accountNumber.slice(0, 4)}…${bankMeta.accountNumber.slice(-4)}`
                : ""}
            </p>
          )}
        </div>
        <button
          onClick={onCancel}
          className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors ml-2 mt-0.5 flex-shrink-0"
          aria-label={et ? "Sulge" : "Close"}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── SUMMARY — always visible ──────────────────────────────────────── */}
      <div className="px-4 pb-3 flex-shrink-0 border-b border-black/[0.07]">
        {/* Counts + totals */}
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
          {needsReview.length > 0 && (
            <span className="text-[#F59E0B] font-medium">
              {needsReview.length} {et ? "vajab kontrolli" : "needs review"}
            </span>
          )}
          <span className="text-[#64748B]">
            {transactions.length} {et ? "tehingut kokku" : "transactions total"}
          </span>
        </div>
        {/* Balances */}
        {(bankMeta?.openingBalance != null ||
          bankMeta?.closingBalance != null) && (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] mt-0.5">
            {bankMeta.openingBalance != null && (
              <span className="text-[#64748B]">
                {et ? "Algsaldo" : "Opening"}:{" "}
                {bankMeta.openingBalance.toFixed(2)} €
              </span>
            )}
            {bankMeta.closingBalance != null && (
              <span className="text-[#64748B]">
                {et ? "Lõppsaldo" : "Closing"}:{" "}
                {bankMeta.closingBalance.toFixed(2)} €
              </span>
            )}
          </div>
        )}
        {/* Reconciliation note — legacy field from old pipeline, shown when present */}
        {bankMeta?.reconciliationNote && (
          <p
            className={`text-[10px] mt-1 leading-relaxed ${bankMeta.reconciliationOk === false ? "text-[#DC2626]" : "text-[#16A34A]"}`}
          >
            {bankMeta.reconciliationOk === false ? "⚠ " : "✓ "}
            {bankMeta.reconciliationNote}
          </p>
        )}
        {/* Second-pass diagnostic */}
        {bankMeta?.secondPassRecovered != null &&
          bankMeta.secondPassRecovered > 0 && (
            <p className="text-[10px] text-[#64748B] mt-0.5">
              {et
                ? `✓ Teine skannimisring taastas ${bankMeta.secondPassRecovered} puuduvat tehingut`
                : `✓ Second scan recovered ${bankMeta.secondPassRecovered} missing transaction(s)`}
            </p>
          )}
      </div>

      {/* ── SCROLLABLE TRANSACTION LIST ───────────────────────────────────── */}
      {/* min-h-0 is required: flex children default to min-height:auto, which
          prevents overflow-y:auto from kicking in. Without it, this div
          would expand to its full content height and never scroll. */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
        {income.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-[#16A34A] mb-1 uppercase tracking-wide">
              {et ? "Tulud" : "Income"} ({income.length}) · +
              {totalIncome.toFixed(2)} EUR
            </p>
            <TxTable rows={income} color="text-[#16A34A]" />
          </>
        )}
        {expenses.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-[#DC2626] mb-1 uppercase tracking-wide">
              {et ? "Kulud" : "Expenses"} ({expenses.length}) · −
              {totalExpenses.toFixed(2)} EUR
            </p>
            <TxTable rows={expenses} color="text-[#DC2626]" />
          </>
        )}
        {needsReview.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-[#F59E0B] mb-1 uppercase tracking-wide">
              {et ? "Vajab kontrolli" : "Needs review"} ({needsReview.length})
            </p>
            {onEditTransaction && (
              <p className="text-[10px] text-[#64748B] mb-1.5 leading-snug">
                {et
                  ? "Kui tehing on siin valesti liigitatud (nt sissetulek märgitud väljaminekuks), vajuta õigele nupule allpool."
                  : "If a transaction is misclassified here (e.g. income marked as an expense), click the correct button below it."}
              </p>
            )}
            {revalidateError && (
              <p className="text-[10px] text-[#DC2626] mb-1.5">{revalidateError}</p>
            )}
            <TxTable
              rows={needsReview}
              color="text-[#F59E0B]"
              showReason
              editable={Boolean(onEditTransaction)}
            />
          </>
        )}
      </div>

      {/* ── STICKY ACTION FOOTER — always visible ────────────────────────── */}
      <div
        className={`flex-shrink-0 px-4 pt-3 pb-4 border-t border-black/[0.07] ${footerBg}`}
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {/* Unverified: import is allowed but no control totals were found */}
        {isUnverified && (
          <p className="text-[11px] text-[#B45309] font-medium mb-2 leading-snug">
            {et
              ? "⚠ Automaatseid kontrollandmeid ei leitud. Kontrolli tehingud enne importimist."
              : "⚠ No automated control data found. Review transactions before importing."}
          </p>
        )}
        {/* Review-required: reconciliation didn't fully match (balance
            mismatch or flagged rows) — informational only. The button below
            is never disabled by this; the user can fix flagged rows above
            first, or confirm anyway with full awareness of the mismatch. */}
        {validationStatus === "review_required" && (
          <p className="text-[11px] text-[#B45309] font-medium mb-2 leading-snug">
            {blockReason
              ? `⚠ ${blockReason}`
              : et
                ? "⚠ Saldo või tehingud ei klapi täielikult. Kontrolli read enne kinnitamist, aga importida saab."
                : "⚠ Balance or transactions don't fully reconcile. Review rows before confirming, but you can still import."}
          </p>
        )}
        {/* No transactions at all — informational only, button stays enabled */}
        {transactions.length === 0 && (
          <p className="text-[11px] text-[#DC2626] font-medium mb-2 leading-snug">
            {et
              ? "⛔ Tehinguid ei leitud — importimiseks pole midagi."
              : "⛔ No transactions found — nothing to import."}
          </p>
        )}

        <div className="flex gap-2">
          {/* Confirm — always enabled whenever transactions were found; a
              balance mismatch or flagged row is shown as a warning above,
              never disables this button. The user decides. */}
          <button
            onClick={onConfirm}
            disabled={false}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-colors bg-[#16A34A] hover:bg-[#15803D] active:bg-[#166534] cursor-pointer"
          >
            {et ? "Kinnita import" : "Confirm import"}
          </button>
          {/* Cancel — always enabled */}
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg border border-[#BBF7D0] text-sm text-[#16A34A] font-medium hover:bg-[#DCFCE7] active:bg-[#BBF7D0] transition-colors"
          >
            {et ? "Tühista" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
