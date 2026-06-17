import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Transaction } from "../api/client";
import AddTransactionModal from "../components/AddTransactionModal";

function currency(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD_OTHER: "Other card",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "INCOME" | "EXPENSE">("ALL");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMessage(null);
    setImportError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/transactions/import-csv", formData);
      setImportMessage(
        `Imported ${res.data.imported} transaction(s)${
          res.data.skipped ? `, skipped ${res.data.skipped} row(s) that couldn't be parsed` : ""
        }.`
      );
      load();
    } catch (err: any) {
      setImportError(err.response?.data?.error || "Failed to import CSV");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function load() {
    setLoading(true);
    api
      .get<Transaction[]>("/transactions")
      .then((res) => setTransactions(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function deleteTransaction(id: string) {
    await api.delete(`/transactions/${id}`);
    load();
  }

  const filtered = transactions.filter((t) => filter === "ALL" || t.type === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Transactions</h1>
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import CSV"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelected}
            className="hidden"
          />
          <button
            onClick={() => setShowModal(true)}
            className="bg-slate-900 text-white px-3 py-1.5 rounded-md text-sm font-medium"
          >
            + Add cash / other
          </button>
        </div>
      </div>

      {importMessage && <p className="text-sm text-green-600">{importMessage}</p>}
      {importError && <p className="text-sm text-red-600">{importError}</p>}
      <p className="text-xs text-slate-400">
        Import CSV expects columns: Date, Description, Amount (negative = expense), and optional
        Type / Category.
      </p>

      <div className="flex gap-2">
        {(["ALL", "INCOME", "EXPENSE"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${
              filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {f === "ALL" ? "All" : f === "INCOME" ? "Income" : "Expenses"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-slate-500 mt-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-slate-500 mt-8">No transactions yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 bg-white rounded-xl shadow overflow-hidden">
          {filtered.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{t.description}</p>
                <p className="text-xs text-slate-500">
                  {new Date(t.date).toLocaleDateString()} · {t.category} ·{" "}
                  {t.source === "PLAID" ? "Bank" : METHOD_LABEL[t.method ?? "OTHER"]}
                  {t.pending ? " · pending" : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm font-semibold ${
                    t.type === "INCOME" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {t.type === "INCOME" ? "+" : "-"}
                  {currency(Number(t.amount))}
                </span>
                {t.source === "MANUAL" && (
                  <button
                    onClick={() => deleteTransaction(t.id)}
                    className="text-slate-400 hover:text-red-600 text-sm"
                    aria-label="Delete transaction"
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showModal && (
        <AddTransactionModal onClose={() => setShowModal(false)} onSaved={load} />
      )}
    </div>
  );
}
