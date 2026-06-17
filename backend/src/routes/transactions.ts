import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../lib/auth";
import { parseCsv, findColumn } from "../lib/csv";

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const manualTransactionSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  method: z.enum(["CASH", "CARD_OTHER", "BANK_TRANSFER", "OTHER"]),
  amount: z.number().positive(),
  date: z.string().datetime().or(z.string()),
  description: z.string().min(1),
  category: z.string().min(1),
});

router.get("/", async (req: AuthedRequest, res) => {
  const { from, to, type, source, category } = req.query as Record<string, string | undefined>;

  const where: any = { userId: req.userId };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }
  if (type) where.type = type;
  if (source) where.source = source;
  if (category) where.category = category;

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
  });
  res.json(transactions);
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = manualTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { type, method, amount, date, description, category } = parsed.data;

  const transaction = await prisma.transaction.create({
    data: {
      userId: req.userId as string,
      source: "MANUAL",
      type,
      method,
      amount,
      date: new Date(date),
      description,
      category,
    },
  });
  res.status(201).json(transaction);
});

router.put("/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.userId) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  const partialSchema = manualTransactionSchema.partial();
  const parsed = partialSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const data: any = { ...parsed.data };
  if (data.date) data.date = new Date(data.date);

  const updated = await prisma.transaction.update({
    where: { id: req.params.id },
    data,
  });
  res.json(updated);
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.transaction.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.userId) {
    return res.status(404).json({ error: "Transaction not found" });
  }
  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

router.post("/import-csv", upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No CSV file uploaded" });
  }

  const text = req.file.buffer.toString("utf-8");
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return res.status(400).json({ error: "CSV must have a header row and at least one data row" });
  }

  const header = rows[0];
  const dateCol = findColumn(header, "date");
  const descCol = findColumn(header, "description");
  const amountCol = findColumn(header, "amount");
  const typeCol = findColumn(header, "type");
  const categoryCol = findColumn(header, "category");

  if (dateCol === -1 || descCol === -1 || amountCol === -1) {
    return res.status(400).json({
      error:
        "Couldn't find Date, Description, and Amount columns. Expected a header row with those names (or Name/Memo for description).",
    });
  }

  const dataRows = rows.slice(1);
  let imported = 0;
  const skipped: number[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rawDate = row[dateCol]?.trim();
    const rawDesc = row[descCol]?.trim();
    const rawAmount = row[amountCol]?.trim().replace(/[^0-9.\-]/g, "");
    const date = rawDate ? new Date(rawDate) : null;
    const amount = rawAmount ? parseFloat(rawAmount) : NaN;

    if (!date || isNaN(date.getTime()) || !rawDesc || isNaN(amount) || amount === 0) {
      skipped.push(i + 2);
      continue;
    }

    let type: "INCOME" | "EXPENSE";
    const rawType = typeCol !== -1 ? row[typeCol]?.trim().toUpperCase() : undefined;
    if (rawType === "INCOME" || rawType === "EXPENSE") {
      type = rawType;
    } else {
      type = amount < 0 ? "EXPENSE" : "INCOME";
    }

    await prisma.transaction.create({
      data: {
        userId: req.userId as string,
        source: "MANUAL",
        type,
        method: "CARD_OTHER",
        amount: Math.abs(amount),
        date,
        description: rawDesc,
        category: categoryCol !== -1 ? row[categoryCol]?.trim() || "Imported" : "Imported",
      },
    });
    imported++;
  }

  res.json({ imported, skipped: skipped.length, skippedRows: skipped });
});

export default router;
