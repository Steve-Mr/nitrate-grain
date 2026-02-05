
import React, { useState, useEffect, useRef } from 'react';
import { logger } from '../../utils/logger';
import { X, Trash2, Minimize2, Maximize2 } from 'lucide-react';

const DebugConsole = ({ onClose }) => {
    const [logs, setLogs] = useState([]);
    const [isMinimized, setIsMinimized] = useState(false);
    const endRef = useRef(null);

    useEffect(() => {
        return logger.subscribe((newLogs) => {
            setLogs(newLogs);
        });
    }, []);

    useEffect(() => {
        if (endRef.current && !isMinimized) {
            endRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isMinimized]);

    if (isMinimized) {
        return (
            <div className="fixed bottom-4 right-4 z-[9999] bg-black/80 text-white p-2 rounded-lg cursor-pointer shadow-xl border border-white/10"
                 onClick={() => setIsMinimized(false)}>
                 <Maximize2 size={20} />
            </div>
        );
    }

    return (
        <div className="fixed bottom-0 right-0 w-full md:w-2/3 lg:w-1/2 h-1/2 z-[9999] bg-black/90 text-green-400 font-mono text-xs flex flex-col shadow-2xl border-t border-white/20 backdrop-blur-md">
            {/* Header */}
            <div className="flex items-center justify-between p-2 bg-white/10 border-b border-white/10 select-none">
                <span className="font-bold flex items-center gap-2">
                    🖥️ System Logs ({logs.length})
                </span>
                <div className="flex items-center gap-2">
                    <button onClick={logger.clear} className="p-1 hover:bg-white/10 rounded" title="Clear">
                        <Trash2 size={14} />
                    </button>
                    <button onClick={() => setIsMinimized(true)} className="p-1 hover:bg-white/10 rounded" title="Minimize">
                        <Minimize2 size={14} />
                    </button>
                    <button onClick={onClose} className="p-1 hover:bg-red-500/50 rounded" title="Close">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
                {logs.length === 0 && <div className="text-gray-500 italic">No logs yet...</div>}
                {logs.map((log, i) => (
                    <div key={i} className={`break-words font-mono ${
                        log.type === 'error' ? 'text-red-400' :
                        log.type === 'warn' ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                        <span className="opacity-50 mr-2">[{log.time}]</span>
                        {log.msg}
                    </div>
                ))}
                <div ref={endRef} />
            </div>
        </div>
    );
};

export default DebugConsole;
