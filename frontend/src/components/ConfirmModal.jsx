import React from 'react';

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  singleActionOnly = false,
  onConfirm,
  onCancel
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3.5 mb-4">
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
              isDestructive
                ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'
                : 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
            }`}
          >
            <i className={`fas ${isDestructive ? 'fa-triangle-exclamation' : 'fa-circle-info'} text-lg`}></i>
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
              {title}
            </h3>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {isDestructive ? 'Irreversible Action' : 'Notification'}
            </span>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
          {message}
        </p>

        <div className="flex justify-end gap-2.5">
          {!singleActionOnly && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2 rounded-lg text-xs sm:text-sm font-bold text-white shadow-sm transition flex items-center gap-1.5 ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <i className={`fas ${isDestructive ? 'fa-trash-alt' : 'fa-check'}`}></i>
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}