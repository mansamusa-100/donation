import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type {
  AdminDonationCheckoutMethod,
  AdminDonationTransactionRow
} from '../../types/admin';

const PAGE_SIZE = 25;

function formatGmd(n: number) {
  return `D${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString();
}

function checkoutBadgeClass(method: AdminDonationCheckoutMethod) {
  switch (method) {
    case 'wave':
      return 'bg-sky-100 text-sky-900';
    case 'easypay':
      return 'bg-violet-100 text-violet-900';
    case 'bank':
      return 'bg-amber-100 text-amber-900';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

/** Admin report of every recorded donation — searchable by campaign, donor, or payment reference. */
export function DonationsAdminPanel() {
  const [items, setItems] = useState<AdminDonationTransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [method, setMethod] = useState<AdminDonationCheckoutMethod | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loadError, setLoadError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => setQ(searchInput.trim()), 400);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [q, method, from, to]);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await api.getAdminDonations({
        page,
        pageSize: PAGE_SIZE,
        ...(q ? { q } : {}),
        ...(method ? { method } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {})
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load transactions');
      setItems([]);
      setTotal(0);
    }
  }, [page, q, method, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = async () => {
    setExportError('');
    setExportBusy(true);
    try {
      const blob = await api.exportAdminDonationsCsv({
        ...(q ? { q } : {}),
        ...(method ? { method } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {})
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'admin-donation-transactions.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExportBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fromRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toRow = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      {loadError ? (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium">
          {loadError}
        </div>
      ) : null}
      {exportError ? (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-medium">
          {exportError}
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900">Donation transactions</h2>
          <p className="text-sm text-slate-600 mt-1">
            Search by campaign name, donor name, or payment reference. Anonymous gifts show as Anonymous.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="sm:col-span-2 xl:col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="tx-search">
              Search
            </label>
            <input
              id="tx-search"
              type="search"
              placeholder="Campaign name, donor, reference…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="tx-method">
              Checkout
            </label>
            <select
              id="tx-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as AdminDonationCheckoutMethod | '')}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">All methods</option>
              <option value="wave">Wave</option>
              <option value="easypay">DPay</option>
              <option value="bank">Bank transfer</option>
              <option value="direct">Direct</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="tx-from">
              From
            </label>
            <input
              id="tx-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="tx-to">
              To
            </label>
            <input
              id="tx-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={exportBusy}
            onClick={() => void handleExport()}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold disabled:opacity-50">
            {exportBusy ? 'Exporting…' : 'Export CSV'}
          </button>
          {q || method || from || to ? (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setQ('');
                setMethod('');
                setFrom('');
                setTo('');
              }}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Donor</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Tip</th>
                <th className="px-4 py-3">Checkout</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No donation records match these filters.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/campaign/${row.campaign.slug}`}
                        className="font-semibold text-slate-900 hover:underline">
                        {row.campaign.title}
                      </Link>
                      <div className="text-xs text-slate-400 mt-0.5">{row.campaign.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={row.isAnonymous ? 'italic text-slate-500' : 'text-slate-800'}>
                        {row.donorDisplayName}
                      </span>
                      {row.user && !row.isAnonymous ? (
                        <div className="text-xs text-slate-400 mt-0.5">{row.user.email}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                      {formatGmd(row.amount)}
                      {row.platformFeeAmount > 0 ? (
                        <div className="text-xs font-normal text-slate-400">
                          Fee {formatGmd(row.platformFeeAmount)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {row.platformTipAmount > 0 ? formatGmd(row.platformTipAmount) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold ${checkoutBadgeClass(row.checkoutMethod)}`}>
                        {row.checkoutLabel}
                      </span>
                      {row.easypayGatewayCode ? (
                        <div className="text-xs text-slate-400 mt-1">{row.easypayGatewayCode}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 break-all max-w-[12rem]">
                      {row.paymentReference ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 px-4 py-3 bg-slate-50/80">
          <p className="text-xs text-slate-500">
            {total === 0 ? 'No entries' : `Showing ${fromRow}–${toRow} of ${total}`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40">
              Previous
            </button>
            <span className="px-2 py-1.5 text-xs text-slate-600">
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
