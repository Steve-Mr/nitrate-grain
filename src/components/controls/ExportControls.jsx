import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileImage, Check, Layers, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';

const ExportControls = ({
  exportFormat, setExportFormat,
  handleExport, exporting,
  onBatchExport,
  enableFSA, setEnableFSA
}) => {
  const { t } = useTranslation();
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-gray-800 p-5 rounded-2xl shadow-sm">
      <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Download size={14} />
        {t('tabs.export')}
      </h3>

      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            {t('export.format')}
        </label>
        <div className="grid grid-cols-2 gap-2">
            {['tiff', 'jpeg', 'png', 'webp'].map((fmt) => (
                <button
                    key={fmt}
                    onClick={() => setExportFormat(fmt)}
                    className={`flex items-center justify-center gap-2 p-3 text-sm font-medium rounded-xl border transition-all
                        ${exportFormat === fmt
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-black border-transparent shadow-md'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }
                    `}
                >
                    {fmt.toUpperCase()}
                    {exportFormat === fmt && <Check size={12} />}
                </button>
            ))}
        </div>
      </div>

      <button
        onClick={handleExport}
        disabled={exporting}
        className={`w-full py-4 px-4 rounded-xl font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2
            ${exporting
                ? 'bg-gray-400 dark:bg-gray-700 cursor-not-allowed'
                : 'bg-primary-light hover:bg-blue-700 dark:bg-primary-dark dark:hover:bg-blue-400 shadow-primary-light/20'
            }
        `}
      >
        {exporting ? (
            <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {t('export.encoding')}
            </>
        ) : (
            <>
                <Download size={18} />
                {t('export.button')}
            </>
        )}
      </button>

      <button
        onClick={onBatchExport}
        disabled={exporting}
        className="mt-3 w-full py-3 px-4 rounded-xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 border border-transparent dark:border-gray-700"
      >
        <Layers size={18} />
        {t('export.batch_button')}
      </button>

      {/* Advanced Settings */}
      <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs font-bold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 uppercase tracking-wider transition-colors"
          >
             {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
             {t('export.advanced_settings')}
          </button>

          {showAdvanced && (
              <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                       <div className="flex flex-col">
                           <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                               {t('export.enable_fsa')}
                           </span>
                           <span className="text-[10px] text-gray-400 dark:text-gray-500">
                               {t('export.enable_fsa_desc')}
                           </span>
                       </div>
                       <button
                          onClick={() => setEnableFSA(!enableFSA)}
                          className={`
                              relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-light
                              ${enableFSA ? 'bg-primary-light dark:bg-primary-dark' : 'bg-gray-200 dark:bg-gray-700'}
                          `}
                       >
                           <span
                              className={`
                                  absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out
                                  ${enableFSA ? 'translate-x-5' : 'translate-x-0'}
                              `}
                           />
                       </button>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default ExportControls;
