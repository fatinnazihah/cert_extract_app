import React, { useState, useMemo } from 'react';

const FOLDERS = [
  'GD', 'GD_SERVICE',
  'EEBD', 'EEBD_SERVICE',
  'HARNESS', 'HARNESS_SERVICE',
  'ABSORBER', 'ABSORBER_SERVICE',
  'SMOKE HOOD', 'SMOKE HOOD_SERVICE',
  'SCBA', 'SCBA_SERVICE',
  'AREA MONITOR', 'AREA MONITOR_SERVICE',
  'RESCUE KIT', 'RESCUE KIT_SERVICE'
];

export default function EquipmentTable({
  currentCollection,
  items,
  loading,
  onSelectItem,
  onDeleteItem,
  onBulkDelete,
  onBulkMove
}) {
  const [search, setSearch] = useState('');
  const [dateType, setDateType] = useState('expiry');
  const [selectedYear, setSelectedYear] = useState('all');
  const [sortOrder, setSortOrder] = useState('updated_desc');

  // Bulk Selection & Pagination State
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [targetMoveFolder, setTargetMoveFolder] = useState('GD');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const availableYears = useMemo(() => {
    const years = new Set();
    items.forEach((item) => {
      let y = null;
      if (dateType === 'expiry') {
        const d = item.expiry_date || item.exp;
        if (d) y = new Date(d).getFullYear();
      } else if (dateType === 'cert') {
        const match = (item.cert || '').match(/20\d{2}/);
        if (match) y = parseInt(match[0]);
      }
      if (y && !isNaN(y) && y > 2000 && y < 2100) years.add(y);
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [items, dateType]);

  const filteredData = useMemo(() => {
    let result = items.filter((item) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        Object.values(item).some((v) =>
          String(v).toLowerCase().includes(q)
        );

      let matchesYear = true;
      if (selectedYear !== 'all') {
        if (dateType === 'expiry') {
          const d = item.expiry_date || item.exp;
          if (!d || !d.startsWith(selectedYear)) matchesYear = false;
        } else if (dateType === 'cert') {
          if (!(item.cert || '').includes(selectedYear)) matchesYear = false;
        }
      }
      return matchesSearch && matchesYear;
    });

    result.sort((a, b) => {
      if (sortOrder === 'updated_desc')
        return new Date(b.last_updated || 0) - new Date(a.last_updated || 0);
      if (sortOrder === 'updated_asc')
        return new Date(a.last_updated || 0) - new Date(b.last_updated || 0);
      if (sortOrder === 'exp_asc')
        return new Date(a.expiry_date || '2099-01-01') - new Date(b.expiry_date || '2099-01-01');
      if (sortOrder === 'serial_asc')
        return (a.serial || '').localeCompare(b.serial || '');
      return 0;
    });

    return result;
  }, [items, search, selectedYear, dateType, sortOrder]);

  // Paginated Slices
  const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedData.length && paginatedData.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedData.map((d) => d.id || d.serial)));
    }
  };

  const toggleSelectOne = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col min-h-0 overflow-hidden">
      {/* Search and Filters Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
            {currentCollection
              ? currentCollection.replace('_SERVICE', ' (Client Service)')
              : 'Select a Collection'}
          </h2>
          <span className="text-xs bg-gray-200 dark:bg-gray-700 font-bold px-2.5 py-1 rounded-full text-gray-700 dark:text-gray-300">
            {filteredData.length} records found
          </span>
        </div>

        {/* Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-blue-50 dark:bg-gray-700 border border-blue-200 dark:border-gray-600 rounded-lg">
            <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
              {selectedIds.size} records selected on this page
            </span>
            <div className="flex items-center gap-2">
              <select
                value={targetMoveFolder}
                onChange={(e) => setTargetMoveFolder(e.target.value)}
                className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-xs px-2 py-1.5 rounded-lg outline-none font-medium"
              >
                {FOLDERS.map((f) => (
                  <option key={f} value={f}>
                    Move to: {f.replace('_SERVICE', ' (Client)')}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onBulkMove(Array.from(selectedIds), targetMoveFolder)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition shadow-sm"
              >
                Move Selected
              </button>
              <button
                type="button"
                onClick={() => onBulkDelete(Array.from(selectedIds))}
                className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition shadow-sm"
              >
                Delete Selected
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative sm:col-span-2">
            <i className="fas fa-search absolute left-3 top-3 text-gray-400 text-xs"></i>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by serial number, model, certificate..."
              className="w-full border border-gray-300 dark:border-gray-600 pl-8 pr-3 py-2 rounded-lg text-xs sm:text-sm bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700">
            <select
              value={dateType}
              onChange={(e) => {
                setDateType(e.target.value);
                setSelectedYear('all');
                setCurrentPage(1);
              }}
              className="bg-gray-100 dark:bg-gray-600 text-xs font-semibold px-2.5 py-2 outline-none border-r border-gray-300 dark:border-gray-500 cursor-pointer"
            >
              <option value="expiry">📅 Exp</option>
              <option value="cert">📜 Cert</option>
            </select>
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                setCurrentPage(1);
              }}
              className="flex-1 bg-white dark:bg-gray-700 text-xs sm:text-sm px-2 py-2 outline-none cursor-pointer"
            >
              <option value="all">All Years</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 p-2 rounded-lg text-xs sm:text-sm bg-white dark:bg-gray-700 outline-none cursor-pointer font-medium"
          >
            <option value="updated_desc">🕒 Updated (Newest)</option>
            <option value="updated_asc">🕒 Updated (Oldest)</option>
            <option value="exp_asc">📅 Expiring Soon</option>
            <option value="serial_asc">🔤 Serial (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Table Data Body */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-left min-w-[650px]">
          <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-[11px] uppercase font-bold sticky top-0 z-10 border-b border-gray-200 dark:border-gray-600">
            <tr>
              <th className="px-4 py-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.size === paginatedData.length && paginatedData.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded text-blue-600 cursor-pointer"
                />
              </th>
              <th className="px-4 py-3">Serial No</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Expiry Date</th>
              <th className="px-4 py-3">Certificate / Report No</th>
              <th className="px-4 py-3">Last Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs sm:text-sm">
            {loading ? (
              <tr>
                <td colSpan="7" className="p-12 text-center text-gray-400">
                  <i className="fas fa-spinner fa-spin text-2xl mb-2 text-blue-500 block"></i>
                  <span>Loading records...</span>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan="7" className="p-12 text-center text-gray-400">
                  {currentCollection ? 'No matching equipment records found.' : 'Select a folder from the left to view records.'}
                </td>
              </tr>
            ) : (
              paginatedData.map((item) => {
                const targetId = item.id || item.serial;
                const isSelected = selectedIds.has(targetId);
                const updated = item.last_updated
                  ? new Date(item.last_updated).toLocaleDateString()
                  : '-';

                return (
                  <tr
                    key={targetId}
                    onClick={() => onSelectItem(item)}
                    className={`hover:bg-blue-50/40 dark:hover:bg-gray-700/60 transition cursor-pointer ${
                      isSelected ? 'bg-blue-50/80 dark:bg-gray-700/90' : ''
                    }`}
                  >
                    <td
                      className="px-4 py-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(targetId)}
                        className="rounded text-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-gray-900 dark:text-white">
                      {item.serial || targetId}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium truncate max-w-[180px]">
                      {item.model || '-'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-red-500">
                      {item.expiry_date || item.exp || '-'}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-500 dark:text-gray-400">
                      {item.cert || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{updated}</td>
                    <td
                      className="px-4 py-3 text-right space-x-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.pdf_url && (
                        <a
                          href={item.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-500 hover:text-blue-700 p-1.5 inline-block"
                          title="View PDF"
                        >
                          <i className="fas fa-file-pdf"></i>
                        </a>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteItem(targetId);
                        }}
                        className="text-red-500 hover:text-red-700 p-1.5 inline-block"
                        title="Delete Record"
                      >
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400">Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded px-2 py-1 outline-none font-bold"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span className="text-gray-500 dark:text-gray-400 ml-2">
            Showing {filteredData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} -{' '}
            {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600 transition font-bold"
          >
            <i className="fas fa-chevron-left mr-1"></i> Prev
          </button>
          <span className="px-3 py-1 font-bold text-gray-700 dark:text-gray-300">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage >= totalPages}
            className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600 transition font-bold"
          >
            Next <i className="fas fa-chevron-right ml-1"></i>
          </button>
        </div>
      </div>
    </div>
  );
}