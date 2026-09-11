import React, { useState, useEffect } from 'react';

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

export default function EntryDetailModal({
  item,
  isOpen,
  onClose,
  onUpdate,
  onDelete
}) {
  if (!isOpen || !item) return null;

  const [formData, setFormData] = useState({
    serial: '',
    model: '',
    cal: '',
    exp: '',
    cert: '',
    lot: '',
    target_collection: ''
  });

  useEffect(() => {
    setFormData({
      serial: item.serial || item.id || '',
      model: item.model || '',
      cal: item.calibration_date || item.cal || '',
      exp: item.expiry_date || item.exp || '',
      cert: item.cert || '',
      lot: item.lot || '',
      target_collection: item.collection || item.target_collection || 'GD'
    });
  }, [item]);

  const targetSerial = formData.serial || item.serial || item.id || '';
  const qrLink = item.qr_link || `https://qrcertificates-30ddb.web.app/?id=${encodeURIComponent(targetSerial)}`;
  const nfc = `${qrLink}\nCert:${formData.cert}\nSN:${targetSerial}\nCal:${formData.cal}\nExp:${formData.exp}`;

  const handleSave = (e) => {
    e.preventDefault();
    onUpdate({
      ...item,
      previous_collection: item.collection || item.target_collection,
      collection: formData.target_collection,
      target_collection: formData.target_collection,
      ...formData,
      serial: targetSerial
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base sm:text-lg font-bold">
            Equipment Details
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3 text-xs sm:text-sm">
          <div>
            <label className="text-[11px] font-bold text-gray-400">TARGET EQUIPMENT FOLDER *</label>
            <select
              value={formData.target_collection}
              onChange={(e) => setFormData({ ...formData, target_collection: e.target.value })}
              className="w-full border dark:border-gray-600 p-2 rounded-lg bg-blue-50 dark:bg-gray-700 font-semibold text-blue-700 dark:text-blue-300 outline-none focus:ring-2 focus:ring-blue-500"
            >
              {FOLDERS.map((f) => (
                <option key={f} value={f}>
                  {f.replace('_SERVICE', ' (Client Service)')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-400">SERIAL NUMBER (Unique Key)</label>
            <input
              value={formData.serial}
              readOnly
              className="w-full border dark:border-gray-600 p-2 rounded bg-gray-100 dark:bg-gray-700 font-mono text-gray-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-400">MODEL</label>
            <input
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              className="w-full border dark:border-gray-600 p-2 rounded bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-gray-400">CAL DATE (YYYY-MM-DD)</label>
              <input
                value={formData.cal}
                onChange={(e) => setFormData({ ...formData, cal: e.target.value })}
                className="w-full border dark:border-gray-600 p-2 rounded bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400">EXP DATE (YYYY-MM-DD)</label>
              <input
                value={formData.exp}
                onChange={(e) => setFormData({ ...formData, exp: e.target.value })}
                className="w-full border dark:border-gray-600 p-2 rounded text-red-500 bg-white dark:bg-gray-700 font-semibold outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400">CERT NO</label>
              <input
                value={formData.cert}
                onChange={(e) => setFormData({ ...formData, cert: e.target.value })}
                className="w-full border dark:border-gray-600 p-2 rounded bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400">LOT NO</label>
              <input
                value={formData.lot}
                onChange={(e) => setFormData({ ...formData, lot: e.target.value })}
                className="w-full border dark:border-gray-600 p-2 rounded bg-white dark:bg-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-400">LAST RECORD UPDATE</label>
            <div className="text-gray-500 py-1 font-mono text-xs">
              {item.last_updated ? new Date(item.last_updated).toLocaleString() : 'Just now'}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <a
              href={item.pdf_url || '#'}
              target="_blank"
              rel="noreferrer"
              className={`flex-1 py-2 rounded-lg text-center font-bold text-xs sm:text-sm transition ${
                item.pdf_url
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
              }`}
            >
              <i className="fas fa-file-pdf mr-1"></i> View PDF
            </a>
            <a
              href={item.qr_image_url || '#'}
              target="_blank"
              rel="noreferrer"
              className={`flex-1 py-2 rounded-lg text-center font-bold text-xs sm:text-sm transition ${
                item.qr_image_url
                  ? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-200'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
              }`}
            >
              <i className="fas fa-qrcode mr-1"></i> View QR
            </a>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => onDelete(item.collection || item.target_collection, targetSerial)}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-bold text-xs sm:text-sm transition shadow flex items-center justify-center gap-1.5"
            >
              <i className="fas fa-trash-alt"></i>
              <span>Delete Entry</span>
            </button>
            <button
              type="submit"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-bold text-xs sm:text-sm transition shadow flex items-center justify-center gap-1.5"
            >
              <i className="fas fa-check"></i>
              <span>Save Changes</span>
            </button>
          </div>
        </form>

        <div className="mt-4 pt-3 border-t dark:border-gray-700">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
            NFC String Payload
          </label>
          <div
            onClick={() => {
              navigator.clipboard.writeText(nfc);
              alert('NFC copied to clipboard!');
            }}
            title="Click to copy"
            className="nfc-box select-all cursor-pointer text-xs"
          >
            {nfc}
          </div>
        </div>
      </div>
    </div>
  );
}