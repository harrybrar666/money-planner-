import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../lib/auth";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthedRequest, res) => {
  const { from, to } = req.query as Record<string, string | undefined>;

  const where: any = { userId: req.userId };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }

  const transactions = await prisma.transaction.findMany({ where });

  let totalIncome = 0;
  let totalExpense = 0;
  const byCategory: Record<string, number> = {};
  const byMonth: Record<string, { income: number; expense: number }> = {};

  for (const t of transactions) {
    const amount = Number(t.amount);
    const monthKey = t.date.toISOString().slice(0, 7);
    byMonth[monthKey] ||= { income: 0, expense: 0 };

    if (t.type === "INCOME") {
      totalIncome += amount;
      byMonth[monthKey].income += amount;
    } else {
      totalExpense += amount;
      byMonth[monthKey].expense += amount;
      byCategory[t.category] = (byCategory[t.category] || 0) + amount;
    }
  }

  res.json({
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
    byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })),
    byMonth: Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v })),
  });
});

export default router;
