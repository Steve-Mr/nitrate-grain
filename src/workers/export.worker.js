// src/workers/export.worker.js
import {
    initializeImageMagick,
    ImageMagick,
    MagickFormat,
    Quantum,
    MagickReadSettings
} from '@imagemagick/magick-wasm';

let isInitialized = false;

const initPromise = initializeImageMagick(new URL('/magick.wasm', import.meta.url));

self.onmessage = async (e) => {
    await initPromise;

    const { width, height, data, channels, logSpace, format = 'tiff', quality = 0.95, timestamp } = e.data;

    try {
        if (!data || data.length === 0) {
            throw new Error("No data received for export");
        }

        // Prepare data for ImageMagick
        // We perform Y-flip and conversion manually.
        const isTiff = format === 'tiff';
        const targetDepth = isTiff ? 16 : 8;
        const totalPixels = width * height;
        const srcChannels = 4; // RGBA from GL

        let magickPixels;

        // Magick read expects a Uint8Array view of the bytes.
        // If we use 16-bit, we create Uint16Array, but we will pass its buffer as Uint8Array.

        if (targetDepth === 16) {
             magickPixels = new Uint16Array(totalPixels * 4); // RGBA
             for (let y = 0; y < height; y++) {
                 const srcRow = height - 1 - y; // Flip Y
                 const srcOff = srcRow * width * srcChannels;
                 const tgtOff = y * width * 4;
                 for (let x = 0; x < width; x++) {
                     for (let c = 0; c < 4; c++) {
                         let val = data[srcOff + (x * 4) + c];
                         if (val < 0) val = 0; if (val > 1) val = 1;
                         // 16-bit scale
                         magickPixels[tgtOff + (x * 4) + c] = (val * 65535) | 0;
                     }
                 }
             }
        } else {
             magickPixels = new Uint8Array(totalPixels * 4);
             for (let y = 0; y < height; y++) {
                 const srcRow = height - 1 - y; // Flip Y
                 const srcOff = srcRow * width * srcChannels;
                 const tgtOff = y * width * 4;
                 for (let x = 0; x < width; x++) {
                     for (let c = 0; c < 4; c++) {
                         let val = data[srcOff + (x * 4) + c];
                         if (val < 0) val = 0; if (val > 1) val = 1;
                         // 8-bit scale
                         magickPixels[tgtOff + (x * 4) + c] = (val * 255) | 0;
                     }
                 }
             }
        }

        // Configure Read Settings for Raw Import
        const readSettings = new MagickReadSettings();
        readSettings.width = width;
        readSettings.height = height;
        readSettings.format = MagickFormat.Rgba; // Input format is raw RGBA pixels
        // Important: Tell Magick input depth
        // Note: MagickReadSettings might not expose `depth` directly in all bindings?
        // Actually it usually infers from type? No, raw import needs depth.
        // Let's assume standard behavior: if 16-bit, we need to handle it.
        // Wait, MagickFormat.Rgba usually assumes 8-bit per channel unless specified?
        // Let's check if we can set depth.
        // If not available, we might need to stick to 8-bit for non-TIFF.
        // For TIFF (16-bit), if we can't set import depth easily, it's tricky.

        // However, we can use `MagickImage.read` with just the buffer and settings.
        // Let's try to set generic depth if possible, or assume 8-bit for now to be safe,
        // EXCEPT for TIFF where we really want 16-bit.
        // Docs often say: readSettings.depth = 16;
        if (targetDepth === 16) {
             // Try setting depth property if exists
             try { readSettings.depth = 16; } catch(e) {}
        }

        // Convert TypedArray to Uint8Array view for WASM passing
        const pixelBytes = new Uint8Array(magickPixels.buffer);

        ImageMagick.read(pixelBytes, readSettings, (image) => {
             // 1. Set Output Format
             let magickFormat;
             switch (format) {
                 case 'tiff': magickFormat = MagickFormat.Tiff; break;
                 case 'jpeg': magickFormat = MagickFormat.Jpeg; break;
                 case 'png': magickFormat = MagickFormat.Png; break;
                 case 'webp': magickFormat = MagickFormat.WebP; break;
                 default: magickFormat = MagickFormat.Jpeg;
             }
             image.format = magickFormat;

             // 2. Set Quality
             if (format === 'jpeg' || format === 'webp') {
                 image.quality = quality * 100;
             }

             // 3. Set Metadata (EXIF)
             if (timestamp) {
                 const date = new Date(timestamp * 1000);
                 const pad = (n) => n.toString().padStart(2, '0');
                 const dateStr = `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

                 image.setAttribute('exif:DateTime', dateStr);
                 image.setAttribute('exif:DateTimeOriginal', dateStr);
                 image.setAttribute('exif:CreateDate', dateStr);

                 image.setAttribute('date:create', date.toISOString());
                 image.setAttribute('date:modify', date.toISOString());
             }

             if (logSpace) {
                 image.comment = `Log Space: ${logSpace}`;
                 image.setAttribute('exif:UserComment', `Log Space: ${logSpace}`);
             }

             // 4. Write
             image.write((outputData) => {
                 const buffer = outputData.slice().buffer;
                 self.postMessage({ type: 'success', buffer }, [buffer]);
             });
        });

    } catch (err) {
        console.error("Export Worker Error:", err);
        self.postMessage({ type: 'error', message: err.message });
    }
};
