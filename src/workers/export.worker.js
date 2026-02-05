
import {
    ImageMagick,
    initializeImageMagick,
    MagickFormat
} from '@imagemagick/magick-wasm';
import { buildExifBuffer } from '../utils/exifWriter.js';

let isInitialized = false;

const log = (msg) => self.postMessage({ type: 'log', message: `Export Worker: ${msg}` });
const error = (msg) => self.postMessage({ type: 'log', message: `Export Worker Error: ${msg}`, level: 'error' });

self.onmessage = async (e) => {
    const { width, height, data, channels, logSpace, format = 'tiff', quality = 0.95, exifData } = e.data;

    try {
        log(`Starting export ${width}x${height} ${format.toUpperCase()}`);
        if (exifData) log(`Received Metadata: ${JSON.stringify(exifData)}`);

        if (!data || data.length === 0) {
            throw new Error("No data received for export");
        }

        if (!isInitialized) {
            log("Initializing ImageMagick WASM...");
            // Locate wasm file in public directory
            const wasmUrl = new URL('/magick.wasm', self.location.origin);
            await initializeImageMagick(wasmUrl);
            isInitialized = true;
            log("ImageMagick Initialized.");
        }

        // Determine Bit Depth for export
        // TIFF: 16-bit
        // Others: 8-bit (usually sufficient for web, and faster)
        const is16Bit = format === 'tiff';
        const maxVal = is16Bit ? 65535 : 255;
        const bytesPerChannel = is16Bit ? 2 : 1;

        // Construct PAM (Portable Arbitrary Map) Header to robustly pass raw data
        // PAM supports arbitrary depth and tuples.
        // We use RGB_ALPHA (4 channels) as input data is RGBA.
        const header = `P7\nWIDTH ${width}\nHEIGHT ${height}\nDEPTH 4\nMAXVAL ${maxVal}\nTUPLTYPE RGB_ALPHA\nENDHDR\n`;
        const headerBytes = new TextEncoder().encode(header);

        const pixelCount = width * height;
        const totalDataSize = pixelCount * 4 * bytesPerChannel;
        const totalSize = headerBytes.length + totalDataSize;

        const buffer = new Uint8Array(totalSize);
        buffer.set(headerBytes, 0);

        const view = new DataView(buffer.buffer);
        let offset = headerBytes.length;

        // Fill Data (Float32 -> Int)
        // WebGL gives bottom-to-top. We keep it as is, and use ImageMagick to flip later.
        for (let i = 0; i < pixelCount * 4; i++) {
            let val = data[i];
            // Clamp [0, 1]
            if (val < 0) val = 0;
            if (val > 1) val = 1;

            if (is16Bit) {
                const intVal = Math.floor(val * 65535);
                // PAM is Big Endian
                view.setUint16(offset, intVal, false);
                offset += 2;
            } else {
                const intVal = Math.floor(val * 255);
                view.setUint8(offset, intVal);
                offset += 1;
            }
        }

        ImageMagick.read(buffer, (image) => {
            // 1. Flip Vertical (correct WebGL coordinates)
            image.flip();

            // 2. Set Metadata (Binary Profile)
            if (exifData) {
                try {
                    const exifProfile = buildExifBuffer(exifData);
                    if (exifProfile) {
                        image.setProfile('exif', exifProfile);
                        log(`Attached EXIF Profile (${exifProfile.length} bytes)`);
                    } else {
                        log("Failed to build EXIF profile (empty result).");
                    }
                } catch (exifErr) {
                    error(`EXIF Construction Failed: ${exifErr.message}`);
                }
            } else {
                log("No EXIF data to attach.");
            }

            // 3. Configure Output
            let outputFormat;
            switch(format) {
                case 'tiff': outputFormat = MagickFormat.Tiff; break;
                case 'jpeg':
                case 'jpg': outputFormat = MagickFormat.Jpeg; break;
                case 'png': outputFormat = MagickFormat.Png; break;
                case 'webp': outputFormat = MagickFormat.WebP; break;
                default: outputFormat = MagickFormat.Jpeg;
            }

            image.format = outputFormat;

            if (quality) {
                image.quality = quality * 100;
            }

            // Write
            image.write((outData) => {
                // outData is Uint8Array
                // Transfer buffer back
                // We must copy because outData might be managed by WASM?
                // Usually safe to transfer if it's a JS array.
                // But let's just postMessage.
                const bufferCopy = new Uint8Array(outData);
                self.postMessage({ type: 'success', buffer: bufferCopy.buffer }, [bufferCopy.buffer]);
            });
        });

    } catch (err) {
        console.error("Export Worker Error:", err);
        error(err.message);
        self.postMessage({ type: 'error', message: err.message });
    }
};
