// src/utils/tiffEncoder.js

/**
 * Encodes raw 16-bit RGB data into an uncompressed TIFF file.
 *
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Uint16Array} data - Interleaved RGB data (R, G, B, R, G, B...)
 * @param {string} [description] - Optional image description (e.g., Log Space name)
 * @param {Object} [metadata] - Optional metadata (e.g., { timestamp: "YYYY:MM:DD HH:MM:SS" })
 * @returns {ArrayBuffer} - The TIFF file binary
 */
export function encodeTiff(width, height, data, description = "", metadata = {}) {
    const headerSize = 8;

    // IFD Entries calculation
    const hasDesc = description && description.length > 0;
    const hasDate = metadata && metadata.timestamp && metadata.timestamp.length > 0;

    // Base entries: 12
    // Optional: ImageDescription (+1), DateTime (+1), DateTimeOriginal (+1)
    // We add DateTimeOriginal (Tag 36867) to main IFD as well for broad compatibility.
    // NOTE: Strictly, it belongs in Exif SubIFD, but some readers check here.
    // However, creating a SubIFD is cleaner.
    // For now, let's just add the standard DateTime (306) which we already did.
    // Let's ALSO add DateTimeOriginal (36867) to the main IFD just in case?
    // Tag 36867 is private Exif tag. But often seen in root IFD in loose implementations.
    // Let's stick to just 306 in IFD0, but actually write the *original* timestamp there.

    // WAIT: The user specifically said "exif info time" is download time.
    // Tag 306 is "Modify Date".
    // We should probably add Exif SubIFD to be robust.
    // BUT, that requires a lot more logic (offset to SubIFD).

    // Compromise: Add Tag 36867 (DateTimeOriginal) to the main IFD.
    // Some strict parsers might ignore it, but many read it.

    const ifdEntryCount = 12 + (hasDesc ? 1 : 0) + (hasDate ? 2 : 0); // Date + DateOriginal

    const ifdSize = 2 + (ifdEntryCount * 12) + 4;

    // Extra values storage (BitsPerSample, XRes, YRes, DescriptionString, DateTimeString)
    // BitsPerSample: 3 * 2 bytes = 6 bytes
    // XResolution: 2 * 4 bytes = 8 bytes (Rational)
    // YResolution: 2 * 4 bytes = 8 bytes (Rational)
    // Description: Length + 1 (null terminator)
    // DateTime: Length + 1 (null terminator)

    const descBytes = hasDesc ? new TextEncoder().encode(description + "\0") : new Uint8Array(0);
    const dateBytes = hasDate ? new TextEncoder().encode(metadata.timestamp + "\0") : new Uint8Array(0);

    // Padding for alignment
    const descPadding = descBytes.length % 2;
    const datePadding = dateBytes.length % 2;

    const extraValuesSize = 22 + descBytes.length + descPadding + dateBytes.length + datePadding;

    const pixelDataSize = data.byteLength;
    const totalSize = headerSize + ifdSize + extraValuesSize + pixelDataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    let offset = 0;

    // --- 1. Header ---
    view.setUint16(offset, 0x4949, true); // "II" (Little Endian)
    offset += 2;
    view.setUint16(offset, 0x002A, true); // 42
    offset += 2;
    view.setUint32(offset, 8, true); // Offset to first IFD (immediately after header)
    offset += 4;

    // --- 2. IFD ---
    // We calculate offsets for "Extra Values" which come after IFD
    const extraValuesOffset = headerSize + ifdSize;
    // Pointers into Extra Values Block
    const bitsPerSampleOffset = extraValuesOffset;
    const xResOffset = extraValuesOffset + 6;
    const yResOffset = extraValuesOffset + 14;

    let currentExtraOffset = extraValuesOffset + 22;

    const descOffset = hasDesc ? currentExtraOffset : 0;
    currentExtraOffset += descBytes.length + descPadding;

    const dateOffset = hasDate ? currentExtraOffset : 0;
    currentExtraOffset += dateBytes.length + datePadding;

    const pixelDataOffset = extraValuesOffset + extraValuesSize;

    const writeTag = (tagId, type, count, valueOrOffset) => {
        view.setUint16(offset, tagId, true);
        offset += 2;
        view.setUint16(offset, type, true);
        offset += 2;
        view.setUint32(offset, count, true);
        offset += 4;
        view.setUint32(offset, valueOrOffset, true);
        offset += 4;
    };

    view.setUint16(offset, ifdEntryCount, true); // Number of entries
    offset += 2;

    // Tags must be sorted by ID!
    // 256: ImageWidth
    writeTag(256, 4, 1, width);

    // 257: ImageLength
    writeTag(257, 4, 1, height);

    // 258: BitsPerSample
    writeTag(258, 3, 3, bitsPerSampleOffset);

    // 259: Compression
    writeTag(259, 3, 1, 1);

    // 262: PhotometricInterpretation
    writeTag(262, 3, 1, 2);

    // 270: ImageDescription (Optional) - Inserted here to maintain sort order (270 < 273)
    if (hasDesc) {
        writeTag(270, 2, descBytes.length, descOffset); // Type 2 = ASCII
    }

    // 273: StripOffsets
    writeTag(273, 4, 1, pixelDataOffset);

    // 277: SamplesPerPixel
    writeTag(277, 3, 1, 3);

    // 278: RowsPerStrip
    writeTag(278, 4, 1, height);

    // 279: StripByteCounts
    writeTag(279, 4, 1, pixelDataSize);

    // 282: XResolution
    writeTag(282, 5, 1, xResOffset);

    // 283: YResolution
    writeTag(283, 5, 1, yResOffset);

    // 296: ResolutionUnit
    writeTag(296, 3, 1, 2);

    // 306: DateTime (Optional)
    if (hasDate) {
        writeTag(306, 2, dateBytes.length, dateOffset);
    }

    // 36867: DateTimeOriginal (Optional) - Added to IFD0 for compatibility
    if (hasDate) {
        writeTag(36867, 2, dateBytes.length, dateOffset);
    }

    // Next IFD Offset (0 = None)
    view.setUint32(offset, 0, true);
    offset += 4;

    // --- 3. Extra Values ---
    // BitsPerSample: [16, 16, 16]
    view.setUint16(offset, 16, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;

    // XResolution: 300/1
    view.setUint32(offset, 300, true); offset += 4;
    view.setUint32(offset, 1, true); offset += 4;

    // YResolution: 300/1
    view.setUint32(offset, 300, true); offset += 4;
    view.setUint32(offset, 1, true); offset += 4;

    // Description String (if exists)
    if (hasDesc) {
        const descView = new Uint8Array(buffer, offset, descBytes.length);
        descView.set(descBytes);
        offset += descBytes.length;
        if (descPadding) {
            view.setUint8(offset, 0);
            offset += 1;
        }
    }

    // DateTime String (if exists)
    if (hasDate) {
        const dateView = new Uint8Array(buffer, offset, dateBytes.length);
        dateView.set(dateBytes);
        offset += dateBytes.length;
        if (datePadding) {
            view.setUint8(offset, 0);
            offset += 1;
        }
    }

    // --- 4. Pixel Data ---
    // Copy the Uint16Array data into the buffer
    // Align offset to start of pixel data (should be accurate if calculations are correct)
    // Just to be safe, use pixelDataOffset relative to buffer start
    const pixelView = new Uint16Array(buffer, pixelDataOffset, width * height * 3);
    pixelView.set(data);

    return buffer;
}
