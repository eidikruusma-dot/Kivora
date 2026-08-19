/**
 * bankImportMapping.ts
 *
 * Pure conversion from a canonical bank-statement row (BankTransaction) into
 * a stored Money transaction (Transaction). Used by BankImportModal.runImport()
 * in FinancePage.tsx. Extracted so the balance-preservation behavior can be
 * covered by a focused regression test without mocking Firestore/fetch.
 */

import type { BankTransaction } from '@/types/bank'
import type { Transaction, TransactionCategory } from '@/types/money'

/**
 * Convert one imported bank transaction row into a Transaction ready to be
 * written to the Money store. Preserves the statement's running balance
 * (never fabricated) — null when the source row had no valid numeric balance.
 */
export function bankTransactionToTransaction(
  item: BankTransaction,
  opts: { id: string; category: TransactionCategory; createdAt: number },
): Transaction {
  const balance =
    typeof item.balance === 'number' && Number.isFinite(item.balance)
      ? item.balance
      : null

  return {
    id: opts.id,
    type: item.direction,
    amount: item.amount,
    currency: item.currency,
    title: item.description.slice(0, 200),
    category: opts.category,
    date: item.date,
    createdAt: opts.createdAt,
    updatedAt: opts.createdAt,
    balance,
  }
}
