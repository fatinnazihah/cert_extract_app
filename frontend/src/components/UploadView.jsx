import React, { useState, useEffect, useRef } from 'react';

export default function UploadView({
  selectedFiles,
  setSelectedFiles,
  isService,
  setIsService,
  manualForm,
  setManualForm,
  onRunBatchAI,
  onSaveManual,
  onClear
}) {
  const fileInputRef = useRef(null);
  const [activePdfIdx, setActivePdfIdx] = useState(0);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [isManualExpanded, setIsManualExpanded] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  // Keep active carousel index in bounds
  useEffect(() => {
    if (activePdfIdx >= selectedFiles.length) {
      setActivePdfIdx(Math.max(0, selectedFiles.length - 1));
    }
  }, [selectedFiles.length, activePdfIdx]);

  // Object URL generation for interactive PDF viewing
  useEffect(() => {
    if (selectedFiles.length > 0 && selectedFiles[activePdfIdx]) {
      const url = URL.createObjectURL(selectedFiles[activePdfIdx]);
      setPdfPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPdfPreviewUrl(null);
    }
  }, [selectedFiles, activePdfIdx]);

  const qrLink = `https://qrcertificates-30ddb.web.app/?id=${encodeURIComponent(manualForm.serial || 'SN...')}`;
  const nfcPayload = `${qrLink}\nCert:${manualForm.cert || ''}\nSN:${manualForm.serial || ''}\nCal:${manualForm.cal || ''}\nExp:${manualForm.exp || ''}`;

  const copyNfc = () => {
    navigator.clipboard.writeText(nfcPayload);
  };

  const nextPdf = (e) => {
    e.stopPropagation();
    if (selectedFiles.length > 1) {
      setActivePdfIdx((prev) => (prev + 1) % selectedFiles.length);
    }
  };

  const prevPdf = (e) => {
    e.stopPropagation();
    if (selectedFiles.length > 1) {
      setActivePdfIdx((prev) => (prev - 1 + selectedFiles.length) % selectedFiles.length);
    }
  };

  const handleFiles = (files) => {
    const arr = Array.from(files).filter((f) => f.type === 'application/pdf');
    setSelectedFiles(arr);
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full h-full flex flex-col lg:flex-row gap-4 overflow-y-auto lg:overflow-hidden pb-4 lg:pb-0">
      {/* ======================================================== */}
      {/* LEFT COLUMN: UPLOAD CONTROLS & MANUAL ENTRY              */}
      {/* ======================================================== */}
      <div className="w-full lg:w-[56%] xl:w-[58%] 2xl:w-[60%] flex flex-col h-auto lg:h-full shrink-0">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 sm:p-5 flex flex-col h-full overflow-y-auto">
          
          {/* Header */}
          <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-file-shield text-blue-600 dark:text-blue-400"></i>
                <span>Upload Certificate</span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Upload calibration certificates for automatic AI extraction or manual entry.
              </p>
            </div>
            <button
              onClick={onClear}
              className="text-xs font-semibold text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition flex items-center gap-1.5"
            >
              <i className="fas fa-rotate-right text-[11px]"></i>
              <span>Reset All</span>
            </button>
          </div>

          {/* Controls Container */}
          <div className="flex flex-col gap-3.5 pt-3.5 flex-1">
            
            {/* 1. Registration Type Toggle */}
            <div>
              <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 block mb-1.5 uppercase tracking-wider">
                1. Registration Type *
              </label>
              <div className="grid grid-cols-2 gap-2 bg-gray-100 dark:bg-gray-900/60 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setIsService(false)}
                  className={`py-2 text-xs sm:text-sm font-bold rounded-md transition flex items-center justify-center gap-2 ${
                    isService === false
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <i className="fas fa-boxes-stacked"></i>
                  <span>Company Asset (Rental)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsService(true)}
                  className={`py-2 text-xs sm:text-sm font-bold rounded-md transition flex items-center justify-center gap-2 ${
                    isService === true
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <i className="fas fa-screwdriver-wrench"></i>
                  <span>Client Service Record</span>
                </button>
              </div>
              {isService === null && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-1.5 flex items-center gap-1.5">
                  <i className="fas fa-circle-exclamation"></i>
                  <span>Select Asset or Client Service before running extraction.</span>
                </p>
              )}
            </div>

            {/* 2. Drag & Drop Upload Zone */}
            <div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-5 text-center hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition flex flex-col items-center justify-center group"
              >
                <div className="w-11 h-11 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-2 group-hover:scale-105 transition">
                  <i className="fas fa-cloud-arrow-up text-blue-600 dark:text-blue-400 text-xl"></i>
                </div>
                <p className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200">
                  {selectedFiles.length === 0 ? (
                    <>Drag & drop PDF certificates here, or <span className="text-blue-600 dark:text-blue-400 underline">browse files</span></>
                  ) : (
                    <span className="text-blue-600 dark:text-blue-400">
                      {selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} PDF Documents Ready`}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                  Supports single or multi-page PDF documents
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) handleFiles(e.target.files);
                  }}
                />
              </div>

              {/* Selected Files List */}
              {selectedFiles.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-2.5 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-xs max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-700">
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center py-1 px-1.5 border-b dark:border-gray-700/60 last:border-0"
                    >
                      <span className="truncate pr-2 font-mono text-xs text-gray-700 dark:text-gray-300">
                        <i className="fas fa-file-pdf text-red-500 mr-2"></i>
                        {file.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-gray-400 text-[10px]">{(file.size / 1024).toFixed(1)} KB</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(idx);
                          }}
                          className="text-gray-400 hover:text-red-500 p-0.5"
                          title="Remove file"
                        >
                          <i className="fas fa-xmark"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AI Auto-Extract Button */}
            <button
              type="button"
              disabled={isService === null || selectedFiles.length === 0}
              onClick={onRunBatchAI}
              className={`w-full py-2.5 sm:py-3 px-4 rounded-lg font-bold shadow-sm transition flex items-center justify-center gap-2 text-xs sm:text-sm ${
                isService === null || selectedFiles.length === 0
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-[0.99]'
              }`}
            >
              <i className="fas fa-wand-magic-sparkles"></i>
              <span>
                {selectedFiles.length > 1
                  ? `Auto-Extract All ${selectedFiles.length} Certificates with AI`
                  : 'Auto-Extract Attached Certificate with AI'}
              </span>
            </button>

            {/* Manual Entry Collapsible Accordion */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50/50 dark:bg-gray-900/30">
              <button
                type="button"
                onClick={() => setIsManualExpanded(!isManualExpanded)}
                className="w-full py-2.5 px-3.5 flex justify-between items-center text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition"
              >
                <div className="flex items-center gap-2">
                  <i className="fas fa-pen-to-square text-gray-400"></i>
                  <span>Manual Record Entry (Single PDF Override)</span>
                </div>
                <i className={`fas fa-chevron-${isManualExpanded ? 'up' : 'down'} text-[10px] text-gray-400`}></i>
              </button>

              {isManualExpanded && (
                <div className="p-3.5 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-3 bg-white dark:bg-gray-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1 uppercase">
                        Equipment Category *
                      </label>
                      <select
                        value={manualForm.category}
                        onChange={(e) => setManualForm({ ...manualForm, category: e.target.value })}
                        className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 outline-none text-xs font-medium"
                      >
                        <option value="GD">Gas Detector (GD)</option>
                        <option value="EEBD">EEBD</option>
                        <option value="HARNESS">Harness</option>
                        <option value="ABSORBER">Absorber</option>
                        <option value="SMOKE HOOD">Smoke Hood</option>
                        <option value="SCBA">SCBA</option>
                        <option value="AREA MONITOR">Area Monitor</option>
                        <option value="RESCUE KIT">Rescue Kit</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1 uppercase">
                        Serial Number *
                      </label>
                      <input
                        value={manualForm.serial}
                        onChange={(e) => setManualForm({ ...manualForm, serial: e.target.value })}
                        placeholder="e.g. 224195"
                        className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 outline-none font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1 uppercase">
                        Model Description
                      </label>
                      <input
                        value={manualForm.model}
                        onChange={(e) => setManualForm({ ...manualForm, model: e.target.value })}
                        placeholder="e.g. MSA Altair 5X"
                        className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 outline-none text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1 uppercase">
                        Calibration Date (YYYY-MM-DD)
                      </label>
                      <input
                        value={manualForm.cal}
                        onChange={(e) => setManualForm({ ...manualForm, cal: e.target.value })}
                        placeholder="YYYY-MM-DD"
                        className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 outline-none text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1 uppercase">
                        Expiry Date (YYYY-MM-DD)
                      </label>
                      <input
                        value={manualForm.exp}
                        onChange={(e) => setManualForm({ ...manualForm, exp: e.target.value })}
                        placeholder="YYYY-MM-DD"
                        className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 outline-none font-semibold font-mono text-red-500 text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1 uppercase">
                        Cert / Report Number
                      </label>
                      <input
                        value={manualForm.cert}
                        onChange={(e) => setManualForm({ ...manualForm, cert: e.target.value })}
                        placeholder="e.g. 6/00381/2026.SRV"
                        className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 outline-none font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1 uppercase">
                        Lot / Job Number
                      </label>
                      <input
                        value={manualForm.lot}
                        onChange={(e) => setManualForm({ ...manualForm, lot: e.target.value })}
                        placeholder="Optional"
                        className="w-full border border-gray-300 dark:border-gray-600 p-2 rounded-lg bg-white dark:bg-gray-700 outline-none text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isService === null}
                    onClick={onSaveManual}
                    className={`w-full py-2.5 rounded-lg font-bold shadow-sm transition flex items-center justify-center gap-2 text-xs ${
                      isService === null
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    <i className="fas fa-floppy-disk"></i>
                    <span>Save Manual Record</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* RIGHT COLUMN: FULL-HEIGHT PDF LIVE VIEWER                */}
      {/* ======================================================== */}
      <div className="w-full lg:w-[44%] xl:w-[42%] 2xl:w-[40%] flex flex-col h-auto lg:h-full min-h-[360px] lg:min-h-0">
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col h-full gap-3">
          
          {/* Top Bar with Carousel Controls */}
          <div className="flex justify-between items-center shrink-0">
            <h4 className="font-bold text-xs uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <i className="fas fa-file-pdf text-red-500 text-sm"></i>
              <span>Live PDF Document Viewer</span>
            </h4>
            
            <div className="flex items-center gap-2">
              {selectedFiles.length > 1 && (
                <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-md text-xs font-bold">
                  <button onClick={prevPdf} className="hover:text-blue-500 px-1" title="Previous PDF">
                    <i className="fas fa-chevron-left"></i>
                  </button>
                  <span className="font-mono">{activePdfIdx + 1} / {selectedFiles.length}</span>
                  <button onClick={nextPdf} className="hover:text-blue-500 px-1" title="Next PDF">
                    <i className="fas fa-chevron-right"></i>
                  </button>
                </div>
              )}

              {/* Mobile Collapse Toggle */}
              <button
                type="button"
                onClick={() => setMobilePreviewOpen(!mobilePreviewOpen)}
                className="lg:hidden p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500"
              >
                <i className={`fas fa-chevron-${mobilePreviewOpen ? 'up' : 'down'}`}></i>
              </button>
            </div>
          </div>

          {/* Stretched Interactive PDF Viewer Canvas */}
          <div className={`flex-1 w-full bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 relative min-h-[220px] lg:min-h-0 ${!mobilePreviewOpen && selectedFiles.length === 0 ? 'hidden lg:block' : 'block'}`}>
            {pdfPreviewUrl ? (
              <object
                data={pdfPreviewUrl}
                type="application/pdf"
                className="w-full h-full"
              >
                <div className="flex flex-col items-center justify-center h-full p-4 text-center text-xs text-gray-500">
                  <i className="fas fa-file-pdf text-3xl text-red-500 mb-2"></i>
                  <span className="font-bold truncate max-w-full px-2">{selectedFiles[activePdfIdx]?.name}</span>
                  <a
                    href={pdfPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-500 underline mt-2 font-semibold"
                  >
                    Open PDF in New Window
                  </a>
                </div>
              </object>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center text-xs text-gray-400 dark:text-gray-500">
                <i className="fas fa-file-pdf text-4xl mb-2 opacity-30"></i>
                <span className="font-medium">No PDF attached for preview</span>
              </div>
            )}
          </div>

          {/* NFC String Payload Preview */}
          <div className="shrink-0">
            <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 block uppercase tracking-wider">
              NFC Text Payload
            </label>
            <div
              onClick={copyNfc}
              title="Click to copy payload"
              className="nfc-box break-all select-all cursor-pointer text-xs p-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg font-mono"
            >
              {manualForm.serial ? nfcPayload : '(Waiting for serial & inspection parameters)'}
            </div>
          </div>

          {/* QR Verification Link */}
          <div className="shrink-0">
            <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 block uppercase tracking-wider">
              QR Verification Link
            </label>
            <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 break-all bg-gray-50 dark:bg-gray-900 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
              {qrLink}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}