import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";

const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Salary",
  "Other",
];

export default function AddTransactionModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [method, setMethod] = useState<"CASH" | "CARD_OTHER" | "BANK_TRANSFER" | "OTHER">("CASH");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/transactions", {
        type,
        method,
        amount: Number(amount),
        date,
        description,
        category,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.toString() || "Failed to save transaction");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <form onSubmit={onSubmit} className="bg-white rounded-xl shadow w-full max-w-sm p-5 space-y-3">
        <h2 className="text-lg font-semibold">Add transaction</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          {(["EXPENSE", "INCOME"] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-2 rounded-md text-sm font-medium ${
                type === t ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {t === "EXPENSE" ? "Expense" : "Income"}
            </button>
          ))}
        </div>

        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as any)}
          className="w-full border border-slate-300 rounded-md px-3 py-2"
        >
          <option value="CASH">Cash</option>
          <option value="CARD_OTHER">Other card (not linked)</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="OTHER">Other</option>
        </select>

        <input
          type="number"
          required
          min="0.01"
          step="0.01"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2"
        />

        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2"
        />

        <input
          type="text"
          required
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2"
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border border-slate-300 rounded-md px-3 py-2"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-md bg-slate-100 text-slate-700 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-2 rounded-md bg-slate-900 text-white font-medium disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
