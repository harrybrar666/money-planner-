import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4000/api",
  withCredentials: true,
});

export interface Transaction {
  id: string;
  source: "PLAID" | "MANUAL";
  type: "INCOME" | "EXPENSE";
  amount: string;
  date: string;
  description: string;
  category: string;
  method: "CASH" | "CARD_OTHER" | "BANK_TRANSFER" | "OTHER" | null;
  pending: boolean;
}

export interface Summary {
  totalIncome: number;
  totalExpense: number;
  net: number;
  byCategory: { category: string; amount: number }[];
  byMonth: { month: string; income: number; expense: number }[];
}

export interface PlaidAccountItem {
  id: string;
  institutionName: string | null;
  createdAt: string;
  accounts: { id: string; name: string; mask: string | null; type: string | null }[];
}
