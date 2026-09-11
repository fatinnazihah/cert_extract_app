import React from 'react';

export default function BatchReviewModal({
  isOpen,
  onClose,
  items,
  onSelectItem
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-40 p-3 sm:p-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col p-4 sm:p-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
            <span>Batch Processing Results</span>
            <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-2 py-0.5 rounded-full font-semibold">
              {items.length} records
            </span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Click any row to inspect, edit fields, view PDF/QR, or delete misidentified items.
        </p>

        <div className="flex-1 overflow-x-auto overflow-y-auto border dark:border-gray-700 rounded-lg">
          <table className="w-full text-left min-w-[600px]">
            <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-[11px] uppercase sticky top-0">
              <tr>
                <th className="px-3 py-2.5">Serial</th>
                <th className="px-3 py-2.5">Model</th>
                <th className="px-3 py-2.5">Cal Date</th>
                <th className="px-3 py-2.5">Exp Date</th>
                <th className="px-3 py-2.5">Target Folder</th>
                <th className="px-3 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
              {items.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-gray-400">
                    No records remaining in this batch.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const serialVal = item.serial || item.id || '-';
                  const calVal = item.calibration_date || item.cal || '-';
                  const expVal = item.expiry_date || item.exp || '-';
                  const colVal = item.collection || item.target_collection || '-';

                  return (
                    <tr
                      key={serialVal + idx}
                      onClick={() => onSelectItem(item)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition"
                    >
                      <td className="px-3 py-2.5 font-bold font-mono text-gray-900 dark:text-white">
                        {serialVal}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 truncate max-w-[180px]">
                        {item.model || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{calVal}</td>
                      <td className="px-3 py-2.5 font-semibold text-red-500">{expVal}</td>
                      <td className="px-3 py-2.5 font-semibold text-blue-600 dark:text-blue-400">
                        {colVal}
                      </td>
                      <td className="px-3 py-2.5 text-right text-green-600 font-bold">
                        <i className="fas fa-check-circle mr-1"></i>Saved
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-bold text-xs sm:text-sm shadow transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}