import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { api } from "../api/client";
import type { PlaidAccountItem } from "../api/client";

export default function Accounts() {
  const [items, setItems] = useState<PlaidAccountItem[]>([]);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<PlaidAccountItem[]>("/plaid/accounts").then((res) => setItems(res.data));
  }

  useEffect(load, []);

  async function startLink() {
    setError(null);
    try {
      const res = await api.post("/plaid/create-link-token");
      setLinkToken(res.data.linkToken);
    } catch (err: any) {
      setError(err.response?.data?.error?.error_message || "Could not start bank connection. Check Plaid API keys.");
    }
  }

  const onSuccess = useCallback(
    async (publicToken: string) => {
      try {
        await api.post("/plaid/exchange-public-token", { publicToken });
        setLinkToken(null);
        load();
      } catch (err: any) {
        setError(err.response?.data?.error?.error_message || "Failed to link account");
      }
    },
    []
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess,
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function syncNow() {
    setSyncing(true);
    try {
      await api.post("/plaid/sync");
      load();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Linked accounts</h1>
        <button
          onClick={startLink}
          className="bg-slate-900 text-white px-3 py-1.5 rounded-md text-sm font-medium"
        >
          + Connect a bank
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No banks connected yet.</p>
      ) : (
        <div className="space-y-3">
          <button
            onClick={syncNow}
            disabled={syncing}
            className="text-sm font-medium bg-slate-100 px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync now"}
          </button>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="bg-white rounded-xl shadow p-4">
                <p className="font-medium">{item.institutionName || "Bank"}</p>
                <ul className="text-sm text-slate-500 mt-1">
                  {item.accounts.map((a) => (
                    <li key={a.id}>
                      {a.name} {a.mask ? `••${a.mask}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
