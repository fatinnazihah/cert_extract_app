import React from 'react';

export default function Navbar({
  activeTab,
  setActiveTab,
  isDark,
  toggleTheme,
  toggleSidebar,
  batchCount,
  openBatchModal
}) {
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
      <div className="w-full px-3 sm:px-6 lg:px-8 py-2.5 flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="md:hidden p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 hover:bg-gray-200"
            aria-label="Toggle Folders"
          >
            <i className="fas fa-bars"></i>
          </button>

          <img
            src="/chsb_logo.png"
            alt="CHSB Logo"
            className="h-8 w-auto object-contain"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <h1 className="text-base sm:text-lg font-bold tracking-tight flex items-center gap-2">
            <span>CHSB CertExt</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-1.5 py-0.5 rounded font-semibold uppercase">
              Admin
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {batchCount > 0 && (
            <button
              onClick={openBatchModal}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold shadow-sm transition flex items-center gap-1.5"
            >
              <i className="fas fa-list-check"></i>
              <span>Batch ({batchCount})</span>
            </button>
          )}

          <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3.5 py-1 text-xs sm:text-sm font-semibold rounded-md transition ${
                activeTab === 'dashboard'
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-300'
              }`}
            >
              Dashboard
            </button>

            <button
              onClick={() => setActiveTab('upload')}
              className={`px-3.5 py-1 text-xs sm:text-sm font-semibold rounded-md transition ${
                activeTab === 'upload'
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-300'
              }`}
            >
              Add / Upload
            </button>
          </div>

          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-yellow-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            title="Toggle Theme"
          >
            <i className={`fas ${isDark ? 'fa-sun' : 'fa-moon'} text-xs sm:text-sm`}></i>
          </button>
        </div>
      </div>
    </header>
  );
}