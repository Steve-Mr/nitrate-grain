
import { useState, useEffect } from 'react';

// Simple event bus for logs
const listeners = new Set();
const logs = [];
const MAX_LOGS = 200;

const notify = () => {
    listeners.forEach(l => l([...logs]));
};

export const logger = {
    log: (...args) => {
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
        logs.push({ type: 'info', msg, time: new Date().toLocaleTimeString() });
        if (logs.length > MAX_LOGS) logs.shift();
        notify();
        // Also print to real console
        // eslint-disable-next-line no-console
        console.log(...args);
    },
    error: (...args) => {
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
        logs.push({ type: 'error', msg, time: new Date().toLocaleTimeString() });
        if (logs.length > MAX_LOGS) logs.shift();
        notify();
        // eslint-disable-next-line no-console
        console.error(...args);
    },
    warn: (...args) => {
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
        logs.push({ type: 'warn', msg, time: new Date().toLocaleTimeString() });
        if (logs.length > MAX_LOGS) logs.shift();
        notify();
        // eslint-disable-next-line no-console
        console.warn(...args);
    },
    subscribe: (callback) => {
        listeners.add(callback);
        callback([...logs]); // Initial call
        return () => listeners.delete(callback);
    },
    clear: () => {
        logs.length = 0;
        notify();
    }
};
