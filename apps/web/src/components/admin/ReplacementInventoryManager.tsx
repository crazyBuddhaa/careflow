'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Lock,
  PackagePlus,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  type ReplacementInventoryCategoryRecord,
  type ReplacementInventoryItemRecord,
  type ReplacementInventoryMovementRecord,
  type ReplacementInventoryStatus,
  type ReplacementStockBatchRecord,
  UserRole,
} from '@careflow/shared';

interface ReplacementInventoryManagerProps {
  currentUserId: string;
  currentUserName: string;
  currentUserRole: UserRole;
}

function formatInventoryStatusBadge(status: ReplacementInventoryStatus): {
  label: string;
  classes: string;
} {
  switch (status) {
    case 'AVAILABLE':
      return {
        label: 'AVAILABLE',
        classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      };
    case 'RESERVED':
      return {
        label: 'RESERVED',
        classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      };
    case 'ISSUED':
      return {
        label: 'ISSUED',
        classes: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
      };
    case 'EXPIRED':
      return {
        label: 'EXPIRED',
        classes: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
      };
    case 'INVALID':
      return {
        label: 'INVALID',
        classes: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      };
    case 'WITHDRAWN':
      return {
        label: 'WITHDRAWN',
        classes: 'bg-slate-700/60 text-slate-300 border-slate-600',
      };
  }
}

export function ReplacementInventoryManager({
  currentUserRole,
}: ReplacementInventoryManagerProps) {
  const canManageStock =
    currentUserRole === UserRole.Supervisor ||
    currentUserRole === UserRole.Admin ||
    currentUserRole === UserRole.Owner;

  const [categories, setCategories] = useState<ReplacementInventoryCategoryRecord[]>([]);
  const [items, setItems] = useState<ReplacementInventoryItemRecord[]>([]);
  const [batches, setBatches] = useState<ReplacementStockBatchRecord[]>([]);
  const [movements, setMovements] = useState<ReplacementInventoryMovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    'stock_items' | 'categories_batches' | 'add_import' | 'accountability_log'
  >('stock_items');

  // Filters
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Revealed Credentials Map
  const [revealedItemMap, setRevealedItemMap] = useState<
    Record<
      string,
      {
        inventoryItemId: string;
        identifierMasked: string;
        credentialsPlaintext: string;
      }
    >
  >({});

  // Create Category Form
  const [catName, setCatName] = useState('');
  const [catProduct, setCatProduct] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catMinThreshold, setCatMinThreshold] = useState(5);

  // Add Single Item Form
  const [singleCatId, setSingleCatId] = useState('');
  const [singleBatchName, setSingleBatchName] = useState('');
  const [singleIdentifier, setSingleIdentifier] = useState('');
  const [singleSecret, setSingleSecret] = useState('');
  const [singleDetails, setSingleDetails] = useState('');
  const [singleExpiresAt, setSingleExpiresAt] = useState('');

  // Bulk Import Form
  const [bulkCatId, setBulkCatId] = useState('');
  const [bulkBatchName, setBulkBatchName] = useState('');
  const [bulkSupplier, setBulkSupplier] = useState('');
  const [bulkExpiresAt, setBulkExpiresAt] = useState('');
  const [bulkRawLines, setBulkRawLines] = useState('');

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      if (selectedCategoryId !== 'all') {
        params.set('categoryId', selectedCategoryId);
      }
      if (selectedStatus !== 'all') {
        params.set('status', selectedStatus);
      }

      const res = await fetch(`/api/admin/inventory?${params.toString()}`);
      const json = await res.json();
      if (res.ok && json.data) {
        setCategories(json.data.categories || []);
        setItems(json.data.items || []);
        setBatches(json.data.batches || []);
        setMovements(json.data.movements || []);
      } else {
        setErrorMessage(json.error?.message || 'Failed to load replacement inventory.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [selectedCategoryId, selectedStatus]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const lowStockCategories = categories.filter((c) => c.isLowStock);

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      item.productOrService.toLowerCase().includes(q) ||
      item.categoryName.toLowerCase().includes(q) ||
      item.identifierMasked.toLowerCase().includes(q) ||
      (item.associatedComplaintRef || '').toLowerCase().includes(q) ||
      (item.associatedOrderId || '').toLowerCase().includes(q)
    );
  });

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setErrorMessage(null);

    const res = await fetch('/api/admin/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_category',
        name: catName.trim(),
        productOrService: catProduct.trim() || catName.trim(),
        description: catDesc.trim(),
        minStockThreshold: Number(catMinThreshold) || 5,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErrorMessage(json.error?.message || 'Failed to create inventory category.');
      return;
    }
    setCatName('');
    setCatProduct('');
    setCatDesc('');
    setStatusBanner(`Created inventory category "${json.data.name}".`);
    await loadInventory();
  };

  const handleAddSingleItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCategoryId = singleCatId || categories[0]?.id || '';
    if (!targetCategoryId || !singleIdentifier.trim() || !singleSecret.trim()) {
      setErrorMessage('Select a category and enter account identifier and secret.');
      return;
    }

    const res = await fetch('/api/admin/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_item',
        categoryId: targetCategoryId,
        batchCode: singleBatchName.trim() || undefined,
        accountIdentifier: singleIdentifier.trim(),
        accountSecret: singleSecret.trim(),
        additionalDetails: singleDetails.trim() || undefined,
        expiresAt: singleExpiresAt || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErrorMessage(json.error?.message || 'Failed to add replacement item.');
      return;
    }
    setSingleIdentifier('');
    setSingleSecret('');
    setSingleDetails('');
    const addedItem = json.data?.addedItems?.[0];
    setStatusBanner(
      `Added encrypted replacement item (${addedItem?.identifierMasked || 'Encrypted'}) to ${json.data?.batch?.categoryName || 'inventory'}.`
    );
    await loadInventory();
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCategoryId = bulkCatId || categories[0]?.id || '';
    if (!targetCategoryId || !bulkRawLines.trim()) {
      setErrorMessage('Select a category and paste at least one credential line.');
      return;
    }

    const credentialsList = bulkRawLines
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (credentialsList.length === 0) {
      setErrorMessage('No valid credential lines found.');
      return;
    }

    const res = await fetch('/api/admin/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'bulk_import',
        categoryId: targetCategoryId,
        batchCode:
          bulkBatchName.trim() || `BATCH-${new Date().toISOString().slice(0, 10)}`,
        supplierRef: bulkSupplier.trim() || undefined,
        expiresAt: bulkExpiresAt || undefined,
        credentialsList,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErrorMessage(json.error?.message || 'Bulk stock import failed.');
      return;
    }
    setBulkRawLines('');
    setBulkBatchName('');
    setStatusBanner(
      `Imported ${json.data?.addedItems?.length || credentialsList.length} replacement accounts in batch "${json.data?.batch?.batchCode || ''}".`
    );
    setActiveTab('stock_items');
    await loadInventory();
  };

  const handleRevealItemCredentials = async (itemId: string) => {
    const res = await fetch(`/api/admin/inventory/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reveal_credentials' }),
    });
    const json = await res.json();
    if (res.ok && json.data) {
      setRevealedItemMap((prev) => ({
        ...prev,
        [itemId]: json.data,
      }));
    } else {
      setErrorMessage(json.error?.message || 'Not authorized to reveal credentials.');
    }
  };

  const handleTransitionStatus = async (
    itemId: string,
    nextStatus: ReplacementInventoryStatus,
    reason: string,
    complaintId?: string | null
  ) => {
    const res = await fetch(`/api/admin/inventory/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: nextStatus === 'AVAILABLE' ? 'release_reservation' : 'transition_status',
        nextStatus,
        complaintId: complaintId || undefined,
        reason,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setStatusBanner(`Updated stock item ${itemId} status to ${nextStatus}.`);
      await loadInventory();
    } else {
      setErrorMessage(json.error?.message || 'Status transition failed.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              <Box className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-semibold text-white">
              Replacement Inventory & Credential Vault
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Secure AES-256-GCM encrypted replacement account & key inventory with atomic reservation, low-stock alerts, and full issuance accountability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadInventory()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Stock
          </button>
          {canManageStock && (
            <button
              type="button"
              onClick={() => setActiveTab('add_import')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-teal-400"
            >
              <PackagePlus className="h-3.5 w-3.5" />
              Add / Bulk Import Stock
            </button>
          )}
        </div>
      </div>

      {/* Low Stock Alert Banner */}
      {lowStockCategories.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-200">
          <div className="flex items-center gap-2 font-semibold text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Low Replacement Stock Alert ({lowStockCategories.length} category below threshold)
            </span>
          </div>
          <p className="mt-1 text-[11px]">
            {lowStockCategories
              .map(
                (c) =>
                  `${c.name} (${c.availableCount} available / min threshold ${c.minStockThreshold})`
              )
              .join(' • ')}
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center justify-between rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)}>
            Dismiss
          </button>
        </div>
      )}

      {statusBanner && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-xs text-emerald-200">
          <span>{statusBanner}</span>
          <button type="button" onClick={() => setStatusBanner(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Category Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((cat) => (
          <div
            key={cat.id}
            onClick={() => {
              setSelectedCategoryId(cat.id === selectedCategoryId ? 'all' : cat.id);
              setActiveTab('stock_items');
            }}
            className={`cursor-pointer rounded-xl border p-4 transition ${
              selectedCategoryId === cat.id
                ? 'border-teal-500 bg-teal-500/10'
                : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">{cat.name}</span>
              {cat.isLowStock && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/40">
                  Low Stock
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-400">{cat.productOrService}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800/80 pt-2.5 text-center">
              <div>
                <div className="font-mono text-sm font-bold text-emerald-400">
                  {cat.availableCount}
                </div>
                <div className="text-[10px] text-slate-400">Available</div>
              </div>
              <div>
                <div className="font-mono text-sm font-bold text-amber-300">
                  {cat.reservedCount}
                </div>
                <div className="text-[10px] text-slate-400">Reserved</div>
              </div>
              <div>
                <div className="font-mono text-sm font-bold text-cyan-300">
                  {cat.issuedCount}
                </div>
                <div className="text-[10px] text-slate-400">Issued</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sub-Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {[
          { key: 'stock_items', label: `Replacement Stock Items (${filteredItems.length})` },
          { key: 'categories_batches', label: `Categories & Stock Batches (${batches.length})` },
          ...(canManageStock
            ? [{ key: 'add_import', label: 'Add / Bulk Import Stock' }]
            : []),
          {
            key: 'accountability_log',
            label: `Accountability & Movement Audit (${movements.length})`,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`rounded-lg px-3.5 py-2 text-xs font-medium transition ${
              activeTab === tab.key
                ? 'bg-teal-500/15 text-teal-300 border border-teal-500/40'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Stock Items Table */}
      {activeTab === 'stock_items' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product, masked identifier, claim reference, order ID..."
                className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-8 pr-3 py-2 text-xs text-white"
              />
            </div>
            <select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
            >
              <option value="all">All Statuses</option>
              <option value="AVAILABLE">AVAILABLE</option>
              <option value="RESERVED">RESERVED</option>
              <option value="ISSUED">ISSUED</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="INVALID">INVALID</option>
              <option value="WITHDRAWN">WITHDRAWN</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase text-slate-400">
                  <th className="pb-2.5 pr-3">Product & Category</th>
                  <th className="pb-2.5 px-3">Masked Account / Key</th>
                  <th className="pb-2.5 px-3">Status</th>
                  <th className="pb-2.5 px-3">Accountability / Linked Claim</th>
                  <th className="pb-2.5 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Loading replacement inventory...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No replacement stock items match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const badge = formatInventoryStatusBadge(item.status);
                    const revealed = revealedItemMap[item.id];
                    return (
                      <tr key={item.id} className="hover:bg-slate-950/40">
                        <td className="py-3 pr-3">
                          <div className="font-semibold text-white">{item.productOrService}</div>
                          <div className="text-[11px] text-slate-400">{item.categoryName}</div>
                        </td>
                        <td className="py-3 px-3">
                          {!revealed ? (
                            <div className="flex items-center gap-1.5 font-mono text-slate-200">
                              <Lock className="h-3 w-3 text-amber-400" />
                              <span>{item.identifierMasked}</span>
                            </div>
                          ) : (
                            <div className="rounded border border-cyan-500/40 bg-slate-950 p-2 font-mono text-[11px]">
                              <div className="text-emerald-300">
                                {revealed.credentialsPlaintext}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-block rounded border px-2 py-0.5 text-[10px] font-semibold ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                          {item.expiresAt && (
                            <div className="mt-1 text-[10px] text-slate-400">
                              Expires: {new Date(item.expiresAt).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-300">
                          {item.associatedComplaintRef || item.associatedComplaintId ? (
                            <div>
                              <div>
                                Claim:{' '}
                                <strong className="font-mono text-teal-300">
                                  {item.associatedComplaintRef || item.associatedComplaintId}
                                </strong>
                              </div>
                              {item.associatedOrderId && (
                                <div>Order: {item.associatedOrderId}</div>
                              )}
                              {item.reservedByName && (
                                <div className="text-purple-300">
                                  Reserved by: {item.reservedByName}
                                </div>
                              )}
                              {item.issuedByName && (
                                <div className="text-cyan-300">
                                  Issued by: {item.issuedByName}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-500">Unallocated stock</span>
                          )}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {!revealed ? (
                              <button
                                type="button"
                                onClick={() => void handleRevealItemCredentials(item.id)}
                                className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
                              >
                                Reveal (Audited)
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setRevealedItemMap((prev) => {
                                    const copy = { ...prev };
                                    delete copy[item.id];
                                    return copy;
                                  })
                                }
                                className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300"
                              >
                                Hide
                              </button>
                            )}

                            {canManageStock && item.status === 'RESERVED' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleTransitionStatus(
                                    item.id,
                                    'AVAILABLE',
                                    'Released reservation back to available pool',
                                    item.associatedComplaintId
                                  )
                                }
                                className="rounded border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] text-amber-200"
                              >
                                Release
                              </button>
                            )}

                            {canManageStock &&
                              (item.status === 'AVAILABLE' || item.status === 'RESERVED') && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleTransitionStatus(
                                        item.id,
                                        'INVALID',
                                        'Marked invalid during stock verification'
                                      )
                                    }
                                    className="rounded border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-[11px] text-rose-200"
                                  >
                                    Mark Invalid
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleTransitionStatus(
                                        item.id,
                                        'WITHDRAWN',
                                        'Withdrawn from active inventory'
                                      )
                                    }
                                    className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300"
                                  >
                                    Withdraw
                                  </button>
                                </>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Categories & Stock Batches */}
      {activeTab === 'categories_batches' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
              <h3 className="text-sm font-semibold text-white">
                Stock Batches ({batches.length})
              </h3>
              <div className="mt-3 space-y-2.5">
                {batches.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-white">{b.batchCode}</div>
                      <div className="text-[11px] text-slate-400">
                        Added by {b.createdByName} on {new Date(b.createdAt).toLocaleString()}
                        {b.supplierRef ? ` • Source: ${b.supplierRef}` : ''}
                      </div>
                    </div>
                    <span className="rounded bg-teal-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-teal-300">
                      {b.totalAdded} items
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {canManageStock && (
            <div className="lg:col-span-5">
              <form
                onSubmit={handleCreateCategory}
                className="space-y-3.5 rounded-xl border border-slate-800 bg-slate-900/90 p-5 text-xs"
              >
                <h3 className="text-sm font-semibold text-white">
                  Create Replacement Inventory Category
                </h3>
                <div>
                  <label className="block font-medium text-slate-300">Category Name *</label>
                  <input
                    type="text"
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    placeholder="e.g. Streaming Pro 12-Month Accounts"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300">
                    Associated Product / Service *
                  </label>
                  <input
                    type="text"
                    required
                    value={catProduct}
                    onChange={(e) => setCatProduct(e.target.value)}
                    placeholder="e.g. Streaming Pro Annual"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300">
                    Minimum Stock Threshold (Low-Stock Alert Trigger)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={catMinThreshold}
                    onChange={(e) => setCatMinThreshold(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-teal-500 py-2 font-semibold text-slate-950 hover:bg-teal-400"
                >
                  Create Inventory Category
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Add Single or Bulk Import Stock */}
      {activeTab === 'add_import' && canManageStock && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Manual Single Addition */}
          <form
            onSubmit={handleAddSingleItem}
            className="space-y-3.5 rounded-xl border border-slate-800 bg-slate-900/90 p-5 text-xs"
          >
            <h3 className="text-sm font-semibold text-white">
              Add Single Replacement Account / Key
            </h3>
            <p className="text-slate-400">
              Credentials are encrypted immediately via AES-256-GCM before storage.
            </p>
            <div>
              <label className="block font-medium text-slate-300">Inventory Category *</label>
              <select
                value={singleCatId || categories[0]?.id || ''}
                onChange={(e) => setSingleCatId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.productOrService})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-medium text-slate-300">
                  Account Login / Identifier *
                </label>
                <input
                  type="text"
                  required
                  value={singleIdentifier}
                  onChange={(e) => setSingleIdentifier(e.target.value)}
                  placeholder="user@account.com"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-300">
                  Password / License Secret *
                </label>
                <input
                  type="text"
                  required
                  value={singleSecret}
                  onChange={(e) => setSingleSecret(e.target.value)}
                  placeholder="SecretPasswordOrKey"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-medium text-slate-300">Additional Details</label>
                <input
                  type="text"
                  value={singleDetails}
                  onChange={(e) => setSingleDetails(e.target.value)}
                  placeholder="PIN / Profile slot / Region"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-300">
                  Expiration Date (Optional)
                </label>
                <input
                  type="date"
                  value={singleExpiresAt}
                  onChange={(e) => setSingleExpiresAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-teal-500 py-2 font-semibold text-slate-950 hover:bg-teal-400"
            >
              Encrypt & Add Replacement Item
            </button>
          </form>

          {/* Bulk Import */}
          <form
            onSubmit={handleBulkImport}
            className="space-y-3.5 rounded-xl border border-slate-800 bg-slate-900/90 p-5 text-xs"
          >
            <h3 className="text-sm font-semibold text-white">
              Bulk Stock Batch Import
            </h3>
            <p className="text-slate-400">
              Paste one replacement credential per line using{' '}
              <code className="text-teal-300">identifier | secret | optional_notes</code>
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-medium text-slate-300">Inventory Category *</label>
                <select
                  value={bulkCatId || categories[0]?.id || ''}
                  onChange={(e) => setBulkCatId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-300">Batch Code</label>
                <input
                  type="text"
                  value={bulkBatchName}
                  onChange={(e) => setBulkBatchName(e.target.value)}
                  placeholder="e.g. BATCH-APR-01"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
            </div>
            <div>
              <label className="block font-medium text-slate-300">
                Stock Lines (Identifier | Password/Key | Notes) *
              </label>
              <textarea
                rows={5}
                required
                value={bulkRawLines}
                onChange={(e) => setBulkRawLines(e.target.value)}
                placeholder={`vip_slot_01@domain.com | Pass#9812 | Profile 1\nvip_slot_02@domain.com | Pass#4421 | Profile 2`}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-cyan-500 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
            >
              Encrypt & Import Batch
            </button>
          </form>
        </div>
      )}

      {/* Tab 4: Accountability & Movement Audit Log */}
      {activeTab === 'accountability_log' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <h3 className="text-sm font-semibold text-white">
            Replacement Inventory Accountability & Movement History
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Every stock addition, reservation, release, credential reveal, and issuance is permanently linked to the customer, Order ID, complaint reference, approving supervisor, and issuing agent.
          </p>
          <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto">
            {movements.map((mv) => (
              <div
                key={mv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-semibold text-teal-300">
                      {mv.movementType.toUpperCase()}
                    </span>
                    <span className="text-slate-300">
                      {mv.previousStatus || 'NEW'} → <strong>{mv.newStatus}</strong>
                    </span>
                    {mv.complaintRef && (
                      <span className="font-mono text-cyan-300">
                        Claim: {mv.complaintRef}
                      </span>
                    )}
                    {mv.orderId && (
                      <span className="font-mono text-slate-400">Order: {mv.orderId}</span>
                    )}
                  </div>
                  <p className="mt-1 text-slate-400">{mv.notes}</p>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <div className="text-slate-200">
                    {mv.actorName} ({mv.actorRole})
                  </div>
                  <div>{new Date(mv.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
