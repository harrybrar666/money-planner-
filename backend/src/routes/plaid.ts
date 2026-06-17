import { Router } from "express";
import { CountryCode, Products } from "plaid";
import { plaidClient } from "../lib/plaid";
import { prisma } from "../lib/prisma";
import { encrypt, decrypt } from "../lib/crypto";
import { requireAuth, AuthedRequest } from "../lib/auth";

const router = Router();
router.use(requireAuth);

router.post("/create-link-token", async (req: AuthedRequest, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.userId as string },
      client_name: "Money Planner",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: process.env.PLAID_WEBHOOK_URL,
    });
    res.json({ linkToken: response.data.link_token });
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

router.post("/exchange-public-token", async (req: AuthedRequest, res) => {
  const { publicToken } = req.body as { publicToken: string };
  if (!publicToken) return res.status(400).json({ error: "publicToken is required" });

  try {
    const exchange = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const itemResponse = await plaidClient.itemGet({ access_token: accessToken });
    const institutionName = itemResponse.data.item.institution_id
      ? (await plaidClient.institutionsGetById({
          institution_id: itemResponse.data.item.institution_id,
          country_codes: [CountryCode.Us],
        })).data.institution.name
      : null;

    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });

    const plaidItem = await prisma.plaidItem.create({
      data: {
        userId: req.userId as string,
        itemId,
        accessTokenEnc: encrypt(accessToken),
        institutionName,
      },
    });

    await prisma.plaidAccount.createMany({
      data: accountsResponse.data.accounts.map((a) => ({
        plaidItemId: plaidItem.id,
        accountId: a.account_id,
        name: a.name,
        mask: a.mask ?? undefined,
        type: a.type,
        subtype: a.subtype ?? undefined,
      })),
    });

    await syncTransactionsForItem(plaidItem.id);

    res.json({ ok: true, institutionName });
  } catch (err: any) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

router.get("/accounts", async (req: AuthedRequest, res) => {
  const items = await prisma.plaidItem.findMany({
    where: { userId: req.userId },
    include: { accounts: true },
  });
  res.json(
    items.map((item) => ({
      id: item.id,
      institutionName: item.institutionName,
      createdAt: item.createdAt,
      accounts: item.accounts,
    }))
  );
});

router.post("/sync", async (req: AuthedRequest, res) => {
  const items = await prisma.plaidItem.findMany({ where: { userId: req.userId } });
  let totalSynced = 0;
  for (const item of items) {
    totalSynced += await syncTransactionsForItem(item.id);
  }
  res.json({ synced: totalSynced });
});

router.post("/webhook", async (req, res) => {
  const { webhook_type, webhook_code, item_id } = req.body;
  if (webhook_type === "TRANSACTIONS" && webhook_code === "SYNC_UPDATES_AVAILABLE") {
    const item = await prisma.plaidItem.findUnique({ where: { itemId: item_id } });
    if (item) await syncTransactionsForItem(item.id);
  }
  res.json({ ok: true });
});

async function syncTransactionsForItem(plaidItemId: string): Promise<number> {
  const item = await prisma.plaidItem.findUnique({
    where: { id: plaidItemId },
    include: { accounts: true },
  });
  if (!item) return 0;

  const accessToken = decrypt(item.accessTokenEnc);
  let cursor = item.cursor ?? undefined;
  let added = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor,
    });
    const data = response.data;

    for (const t of data.added) {
      const account = item.accounts.find((a) => a.accountId === t.account_id);
      const type = t.amount > 0 ? "EXPENSE" : "INCOME";
      await prisma.transaction.upsert({
        where: { plaidTransactionId: t.transaction_id },
        create: {
          userId: item.userId,
          source: "PLAID",
          type,
          amount: Math.abs(t.amount),
          date: new Date(t.date),
          description: t.merchant_name || t.name,
          category: t.personal_finance_category?.primary || t.category?.[0] || "Other",
          pending: t.pending,
          plaidTransactionId: t.transaction_id,
          plaidItemId: item.id,
          plaidAccountId: account?.id,
        },
        update: {
          amount: Math.abs(t.amount),
          date: new Date(t.date),
          description: t.merchant_name || t.name,
          pending: t.pending,
        },
      });
      added++;
    }

    for (const t of data.modified) {
      await prisma.transaction.updateMany({
        where: { plaidTransactionId: t.transaction_id },
        data: {
          amount: Math.abs(t.amount),
          date: new Date(t.date),
          description: t.merchant_name || t.name,
          pending: t.pending,
        },
      });
    }

    for (const t of data.removed) {
      await prisma.transaction.deleteMany({ where: { plaidTransactionId: t.transaction_id } });
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  await prisma.plaidItem.update({ where: { id: item.id }, data: { cursor } });
  return added;
}

export default router;
