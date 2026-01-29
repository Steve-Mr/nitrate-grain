import { useState, useEffect, useCallback, useRef } from 'react';
import { useGalleryStorage } from './useGalleryStorage';
import { validateFile } from '../utils/validation';

// Simple p-limit implementation for concurrency control
const pLimit = (concurrency) => {
  const queue = [];
  let active = 0;

  const next = () => {
    active--;
    if (queue.length > 0) {
      const { fn, resolve, reject } = queue.shift();
      run(fn, resolve, reject);
    }
  };

  const run = async (fn, resolve, reject) => {
    active++;
    try {
      resolve(await fn());
    } catch (e) {
      reject(e);
    } finally {
      next();
    }
  };

  return (fn) => new Promise((resolve, reject) => {
    if (active < concurrency) {
      run(fn, resolve, reject);
    } else {
      queue.push({ fn, resolve, reject });
    }
  });
};

const POOL_SIZE = 3;

export const useGallery = () => {
    const storage = useGalleryStorage();
    const [images, setImages] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [error, setError] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Worker Pool
    const workersRef = useRef([]);

    useEffect(() => {
        // Init worker pool
        workersRef.current = Array.from({ length: POOL_SIZE }, (_, i) => ({
            id: i,
            worker: new Worker(new URL('../workers/raw.worker.js', import.meta.url), { type: 'module' }),
            busy: false
        }));
        return () => workersRef.current.forEach(w => w.worker.terminate());
    }, []);

    const refreshImages = useCallback(async () => {
        const list = await storage.getImages();
        setImages(list);
    }, [storage]);

    useEffect(() => {
        refreshImages();
    }, [refreshImages]);

    const extractThumbnail = useCallback((file, assignedWorker) => {
        return new Promise((resolve, reject) => {
            const worker = assignedWorker.worker;
            const msgId = Math.random().toString(36).substring(7);

            const handler = (e) => {
                if (e.data.id === msgId) {
                    worker.removeEventListener('message', handler);
                    if (e.data.type === 'thumbSuccess') {
                        resolve(e.data);
                    } else {
                        reject(new Error(e.data.error || 'Unknown thumbnail error'));
                    }
                }
            };

            worker.addEventListener('message', handler);

            file.arrayBuffer().then(buffer => {
                worker.postMessage({
                    command: 'extractThumbnail',
                    fileBuffer: buffer,
                    id: msgId
                }, [buffer]);
            }).catch(reject);
        });
    }, []);

    const addPhotos = useCallback(async (files) => {
        setIsProcessing(true);
        setError(null);
        let firstAddedId = null;

        // Get current images for duplicate detection
        const currentImages = await storage.getImages();
        const fileList = Array.from(files);
        const duplicates = [];

        // Check for duplicates
        fileList.forEach(file => {
            const isDuplicate = currentImages.some(img =>
                img.name === file.name &&
                img.size === file.size &&
                // Relaxed date check: Only if both exist and match, OR if date is missing (common on mobile) ignore it and trust size/name
                (!img.lastModified || !file.lastModified || img.lastModified === file.lastModified)
            );
            if (isDuplicate) {
                duplicates.push(file.name);
            }
        });

        // Prompt if duplicates found
        if (duplicates.length > 0) {
            const message = `The following images appear to be duplicates:\n\n${duplicates.join('\n')}\n\nDo you want to upload them anyway?`;
            if (window.confirm(message)) {
                // User confirmed, process all files including duplicates
            } else {
                setIsProcessing(false);
                return null;
            }
        }

        const limit = pLimit(POOL_SIZE);

        const processFile = async (file) => {
             try {
                 // Validate file
                 const validation = validateFile(file);
                 if (!validation.valid) {
                     console.warn("Validation failed:", validation.error);
                     setError(prev => prev ? `${prev}\n${validation.error}` : validation.error);
                     return null;
                 }

                 const id = crypto.randomUUID();

                 // Acquire worker
                 // Note: Single-threaded JS ensures find() is atomic in this synchronous block
                 const workerObj = workersRef.current.find(w => !w.busy);

                 if (!workerObj) {
                     // Should not happen if limit matches pool size
                     throw new Error("Worker pool exhausted");
                 }

                 workerObj.busy = true;

                 // 1. Get Thumbnail
                 let thumbBlob = null;
                 try {
                    const thumbData = await extractThumbnail(file, workerObj);
                    // LibRaw usually extracts embedded JPEG.
                    thumbBlob = new Blob([thumbData.data], { type: 'image/jpeg' });
                 } catch (thumbErr) {
                     console.warn("Thumbnail extraction failed for", file.name, thumbErr);
                 } finally {
                     if (workerObj) workerObj.busy = false;
                 }

                 // 2. Save to DB
                 await storage.addImage(file, thumbBlob, id);
                 return id;

             } catch (err) {
                 console.error("Failed to add photo", err);
                 setError(err.message);
                 return null;
             }
        };

        // Parallel Execution
        const results = await Promise.all(fileList.map(file => limit(() => processFile(file))));

        // Find first valid ID (preserving order of fileList)
        const validIds = results.filter(id => id !== null);
        if (validIds.length > 0) {
            firstAddedId = validIds[0];
        }

        await refreshImages();
        setIsProcessing(false);
        return firstAddedId;
    }, [storage, refreshImages, extractThumbnail]);

    const deletePhoto = useCallback(async (id) => {
        await storage.removeImage(id);
        setSelectedId(current => current === id ? null : current);
        await refreshImages();
    }, [storage, refreshImages]);

    const selectPhoto = useCallback((id) => {
        setSelectedId(id);
    }, []);

    // Helpers
    const getSelectedFile = useCallback(async () => {
        if (!selectedId) return null;
        return await storage.getImageFile(selectedId);
    }, [selectedId, storage]);

    const getSelectedState = useCallback(async () => {
        if (!selectedId) return null;
        return await storage.loadState(selectedId);
    }, [selectedId, storage]);

    const saveSelectedState = useCallback(async (adjustments) => {
        if (!selectedId) return;
        await storage.saveState(selectedId, adjustments);
    }, [selectedId, storage]);

    const getFile = useCallback(async (id) => {
        return await storage.getImageFile(id);
    }, [storage]);

    const getState = useCallback(async (id) => {
        return await storage.loadState(id);
    }, [storage]);

    const saveState = useCallback(async (id, adjustments) => {
        await storage.saveState(id, adjustments);
    }, [storage]);

    return {
        images,
        selectedId,
        selectPhoto,
        addPhotos,
        deletePhoto,
        error,
        refreshImages,
        isProcessing,
        getSelectedFile,
        getSelectedState,
        saveSelectedState,
        getFile,
        getState,
        saveState
    };
};
