// src/utils/exifUtils.js

/**
 * Formats a Unix timestamp into EXIF Date String "YYYY:MM:DD HH:MM:SS"
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Formatted date string
 */
export function formatExifDate(timestamp) {
    if (!timestamp) return null;
    const date = new Date(timestamp * 1000);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Creates a minimal EXIF APP1 segment (TIFF structure) containing DateTimeOriginal
 * @param {string} dateString - "YYYY:MM:DD HH:MM:SS"
 * @returns {Uint8Array} The EXIF APP1 segment (including marker and length)
 */
export function createExifBuffer(dateString) {
    if (!dateString) return null;

    // Structure:
    // APP1 Marker (0xFFE1) - 2 bytes
    // Length - 2 bytes
    // Exif Header ("Exif\0\0") - 6 bytes
    // TIFF Header (II or MM + 42 + Offset) - 8 bytes
    // IFD0 (No tags, just pointer to Exif IFD)
    // Exif IFD (DateTimeOriginal)

    // We'll use Little Endian (II)

    // Data to write:
    // 0. Header: "Exif\0\0" (6 bytes)
    // 1. TIFF Header: "II" + 42 + OffsetToIFD0 (8 bytes)
    // 2. IFD0:
    //    - Count (2 bytes) = 2 (ExifOffset + DateTime) - Let's just put DateTime in IFD0 for simplicity usually valid for primary image
    //    Actually, DateTime (Tag 306) usually goes in IFD0. DateTimeOriginal (Tag 36867) goes in Exif SubIFD.
    //    Let's write DateTime (306) in IFD0.

    // Tag 306 (DateTime): Type 2 (ASCII), Count 20, Offset/Value

    const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
    const tiffHeader = [0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]; // II, 42, Offset 8 (immediately follows)

    // IFD0
    // Entry Count: 1
    // Tag: 0x0132 (306 - DateTime)
    // Type: 2 (ASCII)
    // Count: 20 (19 chars + null)
    // Value Offset: Points to data area

    // Size calc:
    // ExifHeader: 6
    // TiffHeader: 8
    // IFD0 Count: 2
    // IFD0 Entry: 12
    // Next IFD Offset: 4
    // Data Area: 20 bytes for string

    const totalDataSize = 6 + 8 + 2 + 12 + 4 + 20;
    const buffer = new ArrayBuffer(totalDataSize);
    const view = new DataView(buffer);

    let offset = 0;

    // Exif Header
    exifHeader.forEach(b => view.setUint8(offset++, b));

    // TIFF Header
    tiffHeader.forEach(b => view.setUint8(offset++, b));

    // IFD0 Start (Relative to TIFF Header Start, which is at index 6)
    // Current absolute offset is 14.
    // We are writing at offset 8 relative to TIFF Header.

    // Number of Entries: 1
    view.setUint16(offset, 1, true); offset += 2;

    // Tag 306 (DateTime)
    view.setUint16(offset, 0x0132, true); offset += 2;
    // Type 2 (ASCII)
    view.setUint16(offset, 2, true); offset += 2;
    // Count 20
    view.setUint32(offset, 20, true); offset += 4;
    // Offset to Value
    // Value is at end of IFD0.
    // IFD0 size = 2 (count) + 12 (entry) + 4 (next ptr) = 18 bytes.
    // IFD0 starts at 8. So end is 26.
    view.setUint32(offset, 26, true); offset += 4;

    // Next IFD Offset (0)
    view.setUint32(offset, 0, true); offset += 4;

    // Value Data (Date String)
    for (let i = 0; i < dateString.length; i++) {
        view.setUint8(offset++, dateString.charCodeAt(i));
    }
    view.setUint8(offset++, 0); // Null terminator

    // Wrap in APP1 (FF E1 + Length)
    // Length includes the 2 bytes of the length itself
    const app1Size = 2 + 2 + totalDataSize;
    const app1Buffer = new Uint8Array(app1Size);

    app1Buffer[0] = 0xFF;
    app1Buffer[1] = 0xE1;
    app1Buffer[2] = (totalDataSize + 2) >> 8;
    app1Buffer[3] = (totalDataSize + 2) & 0xFF;
    app1Buffer.set(new Uint8Array(buffer), 4);

    return app1Buffer;
}

/**
 * Inserts EXIF APP1 segment into a JPEG Blob/Buffer
 * @param {ArrayBuffer} jpegBuffer - The original JPEG data
 * @param {Uint8Array} exifBlock - The APP1 segment to insert
 * @returns {ArrayBuffer} New JPEG buffer with EXIF
 */
export function insertExifIntoJpeg(jpegBuffer, exifBlock) {
    if (!exifBlock) return jpegBuffer;

    const data = new Uint8Array(jpegBuffer);

    // JPEG starts with FF D8
    if (data[0] !== 0xFF || data[1] !== 0xD8) {
        console.warn("Not a valid JPEG");
        return jpegBuffer;
    }

    // Check if there is already an APP1 (Exif) segment at index 2
    // If so, we might want to replace it or just ignore.
    // Usually browser canvas export doesn't include Exif.
    // If there's an APP0 (JFIF), usually at 2.

    // We will insert APP1 immediately after SOI (FF D8)
    // Standard practice: FF D8, FF E1 (Exif), ...

    const newBuffer = new Uint8Array(data.length + exifBlock.length);
    newBuffer[0] = 0xFF;
    newBuffer[1] = 0xD8;

    newBuffer.set(exifBlock, 2);
    newBuffer.set(data.subarray(2), 2 + exifBlock.length);

    return newBuffer.buffer;
}
