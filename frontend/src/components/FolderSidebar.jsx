import React from 'react';

export default function FolderSidebar({
  collections,
  currentCollection,
  onSelectCollection,
  isOpen
}) {
  return (
    <div
      className={`${
        isOpen ? 'flex' : 'hidden'
      } md:flex flex-col w-full md:w-64 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 shrink-0 transition-colors duration-200`}
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Equipment Folders
        </h3>
        <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-500">
          {collections.length} folders
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 max-h-48 md:max-h-full pr-1">
        {collections.map((c) => {
          const isSelected = currentCollection === c;
          const isService = c.includes('SERVICE');
          return (
            <button
              key={c}
              onClick={() => onSelectCollection(c)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs sm:text-sm transition flex items-center ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-semibold'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <i
                className={`fas ${
                  isService ? 'fa-tools text-purple-400' : 'fa-folder text-yellow-400'
                } mr-2 text-xs`}
              ></i>
              <span className="truncate">{c.replace('_SERVICE', ' (Client)')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}