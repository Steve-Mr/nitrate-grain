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
 * Creates a raw EXIF block (TIFF structure) suitable for PNG eXIf chunk or internal use.
 * Does NOT include the "Exif\0\0" header (which is specific to JPEG APP1).
 *
 * Structure:
 * Header: II (2) + 42 (2) + OffsetToIFD0 (4)
 * IFD0:
 *   - Tag 306 (DateTime)
 *   - Tag 34665 (ExifOffset) -> Points to ExifIFD
 * ExifIFD:
 *   - Tag 36867 (DateTimeOriginal)
 *   - Tag 36868 (CreateDate)
 */
export function createRawExifBlock(dateString) {
    if (!dateString) return null;

    // Constants
    const TIFF_HEADER_SIZE = 8;
    const DATE_STRING_LEN = 20; // 19 chars + null

    // We need to calculate sizes to determine offsets.
    // IFD0 Entries: DateTime (306), ExifOffset (34665). Count = 2.
    const IFD0_ENTRY_COUNT = 2;
    const IFD0_SIZE = 2 + (IFD0_ENTRY_COUNT * 12) + 4; // Count + entries + next

    // ExifIFD Entries: DateTimeOriginal (36867), CreateDate (36868). Count = 2.
    const EXIF_IFD_ENTRY_COUNT = 2;
    const EXIF_IFD_SIZE = 2 + (EXIF_IFD_ENTRY_COUNT * 12) + 4;

    // String Data Storage:
    // We have 3 identical strings: DateTime, DateTimeOriginal, CreateDate.
    // To save space, we can point them all to the same offset!
    const STRINGS_SIZE = DATE_STRING_LEN;

    // Layout:
    // 0: TIFF Header (8)
    // 8: IFD0 (30) -> End at 38
    // 38: ExifIFD (30) -> End at 68
    // 68: String Data (20) -> End at 88

    const TOTAL_SIZE = TIFF_HEADER_SIZE + IFD0_SIZE + EXIF_IFD_SIZE + STRINGS_SIZE;
    const buffer = new ArrayBuffer(TOTAL_SIZE);
    const view = new DataView(buffer);

    let offset = 0;

    // --- 1. TIFF Header ---
    view.setUint16(offset, 0x4949, true); // II
    offset += 2;
    view.setUint16(offset, 0x002A, true); // 42
    offset += 2;
    view.setUint32(offset, 8, true); // Offset to IFD0 (starts immediately after header)
    offset += 4;

    // --- 2. IFD0 ---
    // Start at 8
    const ifd0Offset = offset;
    view.setUint16(offset, IFD0_ENTRY_COUNT, true); offset += 2;

    // Tag 306 (DateTime)
    const stringDataOffset = 8 + IFD0_SIZE + EXIF_IFD_SIZE; // 68

    view.setUint16(offset, 0x0132, true); offset += 2;
    view.setUint16(offset, 2, true); offset += 2; // ASCII
    view.setUint32(offset, DATE_STRING_LEN, true); offset += 4;
    view.setUint32(offset, stringDataOffset, true); offset += 4;

    // Tag 34665 (ExifOffset)
    const exifIfdOffset = 8 + IFD0_SIZE; // 38

    view.setUint16(offset, 0x8769, true); offset += 2;
    view.setUint16(offset, 4, true); offset += 2; // Long
    view.setUint32(offset, 1, true); offset += 4;
    view.setUint32(offset, exifIfdOffset, true); offset += 4;

    // Next IFD Offset (0)
    view.setUint32(offset, 0, true); offset += 4;

    // --- 3. Exif IFD ---
    // Start at 38
    view.setUint16(offset, EXIF_IFD_ENTRY_COUNT, true); offset += 2;

    // Tag 36867 (DateTimeOriginal) (0x9003)
    view.setUint16(offset, 0x9003, true); offset += 2;
    view.setUint16(offset, 2, true); offset += 2; // ASCII
    view.setUint32(offset, DATE_STRING_LEN, true); offset += 4;
    view.setUint32(offset, stringDataOffset, true); offset += 4; // Point to same string

    // Tag 36868 (CreateDate) (0x9004)
    view.setUint16(offset, 0x9004, true); offset += 2;
    view.setUint16(offset, 2, true); offset += 2; // ASCII
    view.setUint32(offset, DATE_STRING_LEN, true); offset += 4;
    view.setUint32(offset, stringDataOffset, true); offset += 4; // Point to same string

    // Next IFD Offset (0)
    view.setUint32(offset, 0, true); offset += 4;

    // --- 4. String Data ---
    // Start at 68
    for (let i = 0; i < dateString.length; i++) {
        view.setUint8(offset++, dateString.charCodeAt(i));
    }
    view.setUint8(offset++, 0); // Null terminator

    return new Uint8Array(buffer);
}

/**
 * Creates a JPEG APP1 Segment (Exif)
 * Adds "Exif\0\0" header to the raw EXIF block.
 */
export function createJpegApp1Buffer(dateString) {
    const rawExif = createRawExifBlock(dateString);
    if (!rawExif) return null;

    // "Exif\0\0" = 6 bytes
    const app1DataSize = 6 + rawExif.length;
    // APP1 Marker (2) + Length (2) + Data
    const totalSize = 2 + 2 + app1DataSize;

    const buffer = new Uint8Array(totalSize);

    buffer[0] = 0xFF;
    buffer[1] = 0xE1;
    buffer[2] = (app1DataSize + 2) >> 8;
    buffer[3] = (app1DataSize + 2) & 0xFF;

    // "Exif\0\0"
    buffer.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 4);

    // Raw TIFF data
    buffer.set(rawExif, 10);

    return buffer;
}

/**
 * Inserts EXIF APP1 segment into a JPEG Blob/Buffer
 */
export function insertExifIntoJpeg(jpegBuffer, exifBlock) {
    if (!exifBlock) return jpegBuffer;

    const data = new Uint8Array(jpegBuffer);
    if (data[0] !== 0xFF || data[1] !== 0xD8) return jpegBuffer;

    // Insert after SOI
    const newBuffer = new Uint8Array(data.length + exifBlock.length);
    newBuffer[0] = 0xFF;
    newBuffer[1] = 0xD8;
    newBuffer.set(exifBlock, 2);
    newBuffer.set(data.subarray(2), 2 + exifBlock.length);

    return newBuffer.buffer;
}
