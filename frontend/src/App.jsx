import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import FolderSidebar from './components/FolderSidebar';
import EquipmentTable from './components/EquipmentTable';
import UploadView from './components/UploadView';
import EntryDetailModal from './components/EntryDetailModal';
import BatchReviewModal from './components/BatchReviewModal';
import ConfirmModal from './components/ConfirmModal';
import LoadingOverlay from './components/LoadingOverlay';
import * as apiService from './services/api';

export default function App() {
  const [isDark, setIsDark] = useState(
    localStorage.theme === 'dark' ||
    (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Dashboard Collection State
  const [collections, setCollections] = useState([]);
  const [currentCollection, setCurrentCollection] = useState('');
  const [items, setItems] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);

  // Upload Form states
  const [isService, setIsService] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [manualForm, setManualForm] = useState({
    category: 'GD',
    serial: '',
    model: '',
    cal: '',
    exp: '',
    cert: '',
    lot: ''
  });

  // Modal and Process states
  const [batchResults, setBatchResults] = useState([]);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [isFromBatch, setIsFromBatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  // Universal Custom Confirm / Notice Dialog State
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDestructive: false,
    singleActionOnly: false,
    action: null
  });

  const showConfirm = ({
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDestructive = false,
    singleActionOnly = false,
    onConfirm
  }) => {
    setConfirmConfig({
      isOpen: true,
      title,
      message,
      confirmText,
      cancelText,
      isDestructive,
      singleActionOnly,
      action: onConfirm
    });
  };

  const showNotice = (title, message) => {
    showConfirm({
      title,
      message,
      confirmText: 'OK',
      singleActionOnly: true,
      onConfirm: closeConfirm
    });
  };

  const closeConfirm = () => {
    setConfirmConfig((prev) => ({ ...prev, isOpen: false, action: null }));
  };

  // Sync Theme
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  }, [isDark]);

  const loadCollectionItems = useCallback(async (colName) => {
    if (!colName) return;
    setCurrentCollection(colName);
    setTableLoading(true);
    setSidebarOpen(false);
    try {
      const res = await apiService.getCollectionData(colName);
      setItems(res.data.data || []);
    } catch (err) {
      console.error(`Failed to load ${colName}:`, err);
    } finally {
      setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    apiService.getCollections()
      .then((res) => {
        const cols = res.data.collections || [];
        setCollections(cols);
        if (cols.length > 0) loadCollectionItems(cols[0]);
      })
      .catch((err) => console.error('Failed to load collections:', err));
  }, [loadCollectionItems]);

  const handleSwitchTab = (tab) => {
    setActiveTab(tab);
    if (tab === 'dashboard' && currentCollection) {
      loadCollectionItems(currentCollection);
    }
  };

  const handleClearUploads = () => {
    setSelectedFiles([]);
    setIsService(null);
    setBatchResults([]);
    setManualForm({
      category: 'GD',
      serial: '',
      model: '',
      cal: '',
      exp: '',
      cert: '',
      lot: ''
    });
  };

  // Run Batch AI Extraction with Document Validation Safeguards
  const handleRunBatchAI = async () => {
    if (isService === null) {
      showNotice('Selection Required', 'Please choose Asset or Client Service before running AI extraction.');
      return;
    }
    if (selectedFiles.length === 0) {
      showNotice('No Documents Attached', 'Please attach at least one PDF certificate to begin extraction.');
      return;
    }

    setLoading(true);
    const newBatch = [];
    const failedFiles = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setLoadingMsg(`[${i + 1}/${selectedFiles.length}] Scanning ${file.name}...`);

      try {
        const extractFd = new FormData();
        extractFd.append('file', file);
        extractFd.append('is_service', String(isService));

        const resExt = await apiService.extractPdf(extractFd);

        if (resExt.data.status !== 'success' || !resExt.data.data || resExt.data.data.length === 0) {
          failedFiles.push(file.name);
          continue;
        }

        const itemsFound = resExt.data.data;
        for (const item of itemsFound) {
          setLoadingMsg(`Saving SN ${item.serial} to ${item.target_collection}...`);

          const saveFd = new FormData();
          saveFd.append('file', file);
          saveFd.append('serial', item.serial);
          saveFd.append('model', item.model || '');
          saveFd.append('cal', item.cal || '');
          saveFd.append('exp', item.exp || '');
          saveFd.append('cert', item.cert || '');
          saveFd.append('lot', item.lot || '');
          saveFd.append('collection', item.target_collection);

          const saveRes = await apiService.saveRecord(saveFd);
          newBatch.push({
            ...item,
            id: item.serial,
            collection: item.target_collection,
            target_collection: item.target_collection,
            calibration_date: item.cal,
            expiry_date: item.exp,
            pdf_url: saveRes.data.pdf_url,
            qr_link: saveRes.data.web_link,
            qr_image_url: saveRes.data.qr_image_url,
            last_updated: new Date().toISOString()
          });
        }
      } catch (err) {
        console.error(`Error on ${file.name}:`, err);
        failedFiles.push(file.name);
      }
    }

    setLoading(false);
    setBatchResults(newBatch);

    if (newBatch.length > 0) {
      setBatchModalOpen(true);
      if (failedFiles.length > 0) {
        showNotice(
          'Extraction Summary',
          `Processed ${newBatch.length} equipment items. However, ${failedFiles.length} file(s) (${failedFiles.join(', ')}) could not be parsed.`
        );
      }
    } else {
      showNotice(
        'No Records Found',
        `None of the attached documents could be parsed into calibration equipment records. Please verify the PDF format.`
      );
    }

    if (currentCollection) loadCollectionItems(currentCollection);
  };

  // Save Single Manual Record
  const handleSaveManual = async () => {
    if (isService === null) {
      showNotice('Selection Required', 'Please choose Asset or Client Service before saving.');
      return;
    }
    if (!manualForm.serial.trim()) {
      showNotice('Missing Serial', 'Serial Number is a mandatory field.');
      return;
    }
    if (selectedFiles.length === 0) {
      showNotice('Attachment Missing', 'Please attach the PDF document corresponding to this manual record.');
      return;
    }
    if (selectedFiles.length > 1) {
      showNotice('Single Entry Limit', 'Manual registration accepts exactly 1 PDF file. Use AI Auto-Extract for batch files.');
      return;
    }

    setLoading(true);
    setLoadingMsg(`Saving record ${manualForm.serial}...`);

    const targetCollection = manualForm.category + (isService ? '_SERVICE' : '');
    const fd = new FormData();
    fd.append('file', selectedFiles[0]);
    fd.append('serial', manualForm.serial.trim());
    fd.append('model', manualForm.model.trim());
    fd.append('cal', manualForm.cal.trim());
    fd.append('exp', manualForm.exp.trim());
    fd.append('cert', manualForm.cert.trim());
    fd.append('lot', manualForm.lot.trim());
    fd.append('collection', targetCollection);

    try {
      await apiService.saveRecord(fd);
      showNotice('Success', `Record ${manualForm.serial} saved successfully to folder ${targetCollection}!`);
      handleClearUploads();
      loadCollectionItems(targetCollection);
    } catch (err) {
      showNotice('Save Failed', err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  // Update Record Handler with Target Folder Migration
  const handleUpdateRecord = async (updatedData) => {
    const prevCol = updatedData.previous_collection || currentCollection;
    const nextCol = updatedData.collection || updatedData.target_collection || prevCol;
    const targetSerial = updatedData.serial || updatedData.id;

    if (prevCol !== nextCol) {
      try {
        await apiService.deleteItem(prevCol, targetSerial);
      } catch (err) {
        console.warn(`Purge previous failed:`, err);
      }
    }

    const fd = new FormData();
    fd.append('collection', nextCol);
    fd.append('serial', targetSerial);
    fd.append('model', updatedData.model || '');
    fd.append('cal', updatedData.cal || updatedData.calibration_date || '');
    fd.append('exp', updatedData.exp || updatedData.expiry_date || '');
    fd.append('cert', updatedData.cert || '');
    fd.append('lot', updatedData.lot || '');

    try {
      await apiService.updateRecord(fd);
      showNotice('Update Complete', `Equipment record ${targetSerial} has been modified successfully.`);

      setBatchResults((prev) =>
        prev.map((item) => {
          const matchId = item.serial || item.id;
          if (matchId === targetSerial) {
            return {
              ...item,
              ...updatedData,
              collection: nextCol,
              target_collection: nextCol,
              calibration_date: updatedData.cal || item.calibration_date,
              expiry_date: updatedData.exp || item.expiry_date,
              last_updated: new Date().toISOString()
            };
          }
          return item;
        })
      );

      setDetailModalOpen(false);
      if (isFromBatch) setBatchModalOpen(true);
      if (currentCollection) loadCollectionItems(currentCollection);
    } catch (err) {
      showNotice('Update Failed', err.response?.data?.detail || err.message);
    }
  };

  // Single Delete Dialog
  const handleDeleteItem = (colName, docId) => {
    const targetCol = colName || currentCollection;
    showConfirm({
      title: 'Delete Certificate Record',
      message: `Are you sure you want to permanently delete record "${docId}" from folder "${targetCol}"? This action is irreversible.`,
      confirmText: 'Delete Record',
      isDestructive: true,
      onConfirm: async () => {
        closeConfirm();
        try {
          await apiService.deleteItem(targetCol, docId);
          setBatchResults((prev) => prev.filter((item) => (item.serial || item.id) !== docId));
          setDetailModalOpen(false);
          if (isFromBatch) setBatchModalOpen(true);
          if (currentCollection) loadCollectionItems(currentCollection);
        } catch (err) {
          showNotice('Deletion Error', err.response?.data?.detail || err.message);
        }
      }
    });
  };

  // Bulk Delete Dialog
  const handleBulkDelete = (docIds) => {
    showConfirm({
      title: `Delete ${docIds.length} Records`,
      message: `Are you sure you want to permanently remove all ${docIds.length} selected items from "${currentCollection}"?`,
      confirmText: `Delete (${docIds.length}) Records`,
      isDestructive: true,
      onConfirm: async () => {
        closeConfirm();
        setLoading(true);
        setLoadingMsg(`Deleting ${docIds.length} records...`);
        try {
          for (const id of docIds) {
            await apiService.deleteItem(currentCollection, id);
          }
          setBatchResults((prev) => prev.filter((item) => !docIds.includes(item.serial || item.id)));
          loadCollectionItems(currentCollection);
        } catch (err) {
          showNotice('Bulk Delete Failed', err.message);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // Bulk Move Dialog
  const handleBulkMove = (docIds, targetFolder) => {
    if (targetFolder === currentCollection) {
      showNotice('Notice', 'The selected records are already in this folder.');
      return;
    }

    showConfirm({
      title: `Move ${docIds.length} Records`,
      message: `Move all ${docIds.length} selected equipment records from "${currentCollection}" to "${targetFolder}"?`,
      confirmText: 'Move Records',
      isDestructive: false,
      onConfirm: async () => {
        closeConfirm();
        setLoading(true);
        setLoadingMsg(`Moving ${docIds.length} records to ${targetFolder}...`);

        try {
          for (const id of docIds) {
            const item = items.find((i) => (i.id || i.serial) === id);
            if (!item) continue;

            const fd = new FormData();
            fd.append('collection', targetFolder);
            fd.append('serial', item.serial || id);
            fd.append('model', item.model || '');
            fd.append('cal', item.calibration_date || item.cal || '');
            fd.append('exp', item.expiry_date || item.exp || '');
            fd.append('cert', item.cert || '');
            fd.append('lot', item.lot || '');

            await apiService.updateRecord(fd);
            await apiService.deleteItem(currentCollection, id);
          }
          loadCollectionItems(currentCollection);
        } catch (err) {
          showNotice('Bulk Move Error', err.message);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-900 h-screen flex flex-col text-gray-800 dark:text-gray-100 antialiased overflow-hidden">
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleSwitchTab}
        isDark={isDark}
        toggleTheme={() => setIsDark(!isDark)}
        toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        batchCount={batchResults.length}
        openBatchModal={() => setBatchModalOpen(true)}
      />

      {/* Main Container constrained to remaining viewport height (No Outer Window Scrolling) */}
      <main className="flex-1 w-full p-3 sm:p-4 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'dashboard' ? (
          <div className="flex-1 flex flex-col md:flex-row gap-3 sm:gap-4 min-h-0 h-full">
            <FolderSidebar
              collections={collections}
              currentCollection={currentCollection}
              onSelectCollection={loadCollectionItems}
              isOpen={sidebarOpen}
            />
            <EquipmentTable
              currentCollection={currentCollection}
              items={items}
              loading={tableLoading}
              onSelectItem={(item) => {
                setIsFromBatch(false);
                setSelectedItem({ ...item, collection: currentCollection });
                setDetailModalOpen(true);
              }}
              onDeleteItem={(id) => handleDeleteItem(currentCollection, id)}
              onBulkDelete={handleBulkDelete}
              onBulkMove={handleBulkMove}
            />
          </div>
        ) : (
          <UploadView
            selectedFiles={selectedFiles}
            setSelectedFiles={setSelectedFiles}
            isService={isService}
            setIsService={setIsService}
            manualForm={manualForm}
            setManualForm={setManualForm}
            onRunBatchAI={handleRunBatchAI}
            onSaveManual={handleSaveManual}
            onClear={handleClearUploads}
          />
        )}
      </main>

      {/* Modals */}
      <EntryDetailModal
        item={selectedItem}
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          if (isFromBatch) setBatchModalOpen(true);
        }}
        onUpdate={handleUpdateRecord}
        onDelete={(col, id) => handleDeleteItem(col, id)}
      />

      <BatchReviewModal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        items={batchResults}
        onSelectItem={(item) => {
          setIsFromBatch(true);
          setSelectedItem(item);
          setBatchModalOpen(false);
          setDetailModalOpen(true);
        }}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        cancelText={confirmConfig.cancelText}
        isDestructive={confirmConfig.isDestructive}
        singleActionOnly={confirmConfig.singleActionOnly}
        onConfirm={confirmConfig.action || closeConfirm}
        onCancel={closeConfirm}
      />

      <LoadingOverlay isVisible={loading} message={loadingMsg} />
    </div>
  );
}