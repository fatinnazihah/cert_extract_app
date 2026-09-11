import React from 'react';

export default function LoadingOverlay({ isVisible, message }) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-white/90 dark:bg-gray-900/90 flex flex-col items-center justify-center z-50 p-4 transition-colors">
      <i className="fas fa-circle-notch fa-spin text-4xl sm:text-5xl text-blue-600 mb-3"></i>
      <h3 className="text-base sm:text-lg font-bold">Processing Certificates...</h3>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 text-center max-w-sm">
        {message || 'Please wait'}
      </p>
    </div>
  );
}