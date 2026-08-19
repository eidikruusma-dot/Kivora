async function runImport() {
    const { transactions: importedTxns, bankMeta } = state;
    if (!importedTxns || !bankMeta) return;

    setState((s) => ({ ...s, phase: "importing" }));

    const now = Date.now();
    let incomeAdded = 0,
      expenseAdded = 0,
      failed = 0;

    // 1. Kustutame eelnevalt imporditud tehingud, et vältida topeltkandeid
    try {
      for (const tx of transactions) {
        if (tx.id.startsWith("tx-bank-") || tx.id.startsWith("tx-")) {
          await deleteTransaction(tx.id);
        }
      }
    } catch (e) {
      console.warn("Vanu tehinguid ei õnnestunud täielikult eemaldada:", e);
    }

    // 2. Kirjutame uue väljavõtte puhtalt sisse
    for (let i = 0; i < importedTxns.length; i++) {
      const item = importedTxns[i];
      if (item.pending) continue;

      const type = item.direction;
      const category =
        type === "income"
          ? resolveIncomeCategory(undefined, item.description)
          : resolveExpenseCategory(undefined, item.description);

      const tx: Transaction = bankTransactionToTransaction(item, {
        id: `tx-bank-${now}-${i}`,
        category,
        createdAt: now + i, // tagab õige kronoloogilise järjekorra
      });

      try {
        await addTransaction(tx);
        if (type === "income") incomeAdded++;
        else expenseAdded++;
      } catch {
        failed++;
      }
    }

    const parts: string[] = [];
    if (incomeAdded > 0)
      parts.push(`${incomeAdded} ${et ? "sissetulekut" : "income record(s)"}`);
    if (expenseAdded > 0)
      parts.push(`${expenseAdded} ${et ? "väljaminekut" : "expense(s)"}`);
    if (failed > 0) parts.push(`${failed} ${et ? "ebaõnnestus" : "failed"}`);

    setState((s) => ({
      ...s,
      phase: "done",
      resultSummary:
        parts.join(" · ") ||
        (et ? "Kõik tehingud imporditud." : "All transactions imported."),
    }));
  }
