/**
 * Regression test for the Money module account-balance propagation defect.
 *
 * BankImportModal.runImport() (FinancePage.tsx) used to build the stored
 * Transaction from an imported BankTransaction without carrying over the
 * optional running `balance` field. Because deriveCurrentAccountBalance()
 * only reads `balance` off already-stored transactions, the dashboard's
 * "current account balance" silently fell back to null forever, no matter
 * how many bank statements were imported.
 *
 * All data below is synthetic — invented dates, amounts, and descriptions.
 * None of it comes from a real bank statement.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))
vi.mock('@/lib/calendarStore', () => ({
  addCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  getAllEvents: vi.fn(() => []),
}))

import { deriveCurrentAccountBalance } from '@/lib/moneyStore'
import { bankTransactionToTransaction } from '@/lib/bankImportMapping'
import type { BankTransaction } from '@/types/bank'

describe('bank import balance propagation', () => {
  it('preserves a valid imported running balance during conversion', () => {
    const item: BankTransaction = {
      date: '2031-02-05',
      description: 'Synthetic Test Merchant',
      amount: 12.34,
      currency: 'EUR',
      direction: 'expense',
      balance: 481.02,
    }

    const tx = bankTransactionToTransaction(item, {
      id: 'tx-synthetic-1',
      category: 'other-expense',
      createdAt: 1000,
    })

    expect(tx.balance).toBe(481.02)
  })

  it('stores a null balance (never fabricated) when the source row has none', () => {
    const item: BankTransaction = {
      date: '2031-02-05',
      description: 'Synthetic Test Merchant Without Balance Column',
      amount: 9.5,
      currency: 'EUR',
      direction: 'expense',
    }

    const tx = bankTransactionToTransaction(item, {
      id: 'tx-synthetic-2',
      category: 'other-expense',
      createdAt: 1000,
    })

    expect(tx.balance).toBeNull()
  })

  it('derives the dashboard current account balance from the newest posted transaction, not income minus expenses', () => {
    const older = bankTransactionToTransaction(
      {
        date: '2031-02-01',
        description: 'Synthetic Older Salary',
        amount: 1000,
        currency: 'EUR',
        direction: 'income',
        balance: 1500,
      },
      { id: 'tx-synthetic-a', category: 'salary', createdAt: 1 },
    )
    const newest = bankTransactionToTransaction(
      {
        date: '2031-02-10',
        description: 'Synthetic Newest Grocery Run',
        amount: 200,
        currency: 'EUR',
        direction: 'expense',
        balance: 1300,
      },
      { id: 'tx-synthetic-b', category: 'other-expense', createdAt: 2 },
    )
    // A manually-added transaction with no bank balance must never win or be fabricated into one.
    const manualEntry = {
      id: 'tx-synthetic-c',
      type: 'income' as const,
      amount: 50,
      currency: 'EUR',
      title: 'Synthetic Manual Entry',
      category: 'other-income' as const,
      date: '2031-02-11',
      createdAt: 3,
      updatedAt: 3,
    }

    const balance = deriveCurrentAccountBalance([older, newest, manualEntry])

    expect(balance).toBe(1300)
    // Guard against the historical bug's likely "fix": deriving balance from
    // cash flow instead of the statement's own running balance.
    const incomeMinusExpenses = 1000 - 200
    expect(balance).not.toBe(incomeMinusExpenses)
  })
})
