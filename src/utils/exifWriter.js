
/* eslint-disable no-bitwise */
/**
 * Simple EXIF Writer for ImageMagick Profile Injection.
 * Constructs a minimal TIFF structure (Header + IFD0 + Exif IFD).
 */

const TAGS = {
    // IFD0
    Make: 0x010F,
    Model: 0x0110,
    ExifOffset: 0x8769,

    // Exif IFD
    ExposureTime: 0x829a,
    FNumber: 0x829d,
    ISOSpeedRatings: 0x8827,
    ISOSpeed: 0x8833, // ISO Speed (alternative)
    DateTimeOriginal: 0x9003,
    OffsetTimeOriginal: 0x9011,
    ShutterSpeedValue: 0x9201,
    ApertureValue: 0x9202,
    FocalLength: 0x920a,
    SubSecTimeOriginal: 0x9291,
    LensModel: 0xa434
};

const TYPES = {
    BYTE: 1,      // 8-bit unsigned integer
    ASCII: 2,     // 8-bit byte that contains a 7-bit ASCII code; the last byte must be NUL
    SHORT: 3,     // 16-bit (2-byte) unsigned integer
    LONG: 4,      // 32-bit (4-byte) unsigned integer
    RATIONAL: 5,  // Two LONGs: numerator, denominator
    SRATIONAL: 10 // Two SLONGs
};

const TYPE_SIZES = {
    1: 1,
    2: 1,
    3: 2,
    4: 4,
    5: 8,
    10: 8
};

// Helper to write values to DataView
const writeValue = (view, offset, type, value, littleEndian) => {
    switch (type) {
        case TYPES.ASCII:
            for (let i = 0; i < value.length; i++) {
                view.setUint8(offset + i, value.charCodeAt(i));
            }
            view.setUint8(offset + value.length, 0); // Null terminator
            break;
        case TYPES.SHORT:
            view.setUint16(offset, value, littleEndian);
            break;
        case TYPES.LONG:
            view.setUint32(offset, value, littleEndian);
            break;
        case TYPES.RATIONAL:
        case TYPES.SRATIONAL:
            // Value is [numerator, denominator]
            view.setUint32(offset, value[0], littleEndian);
            view.setUint32(offset + 4, value[1], littleEndian);
            break;
        default:
            break;
    }
};

const toRational = (num) => {
    if (num === undefined || num === null) return [0, 1];

    // Simple float to rational approximation
    const tolerance = 1.0E-6;
    let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
    let b = num;
    do {
        let a = Math.floor(b);
        let aux = h1;
        h1 = a * h1 + h2;
        h2 = aux;
        aux = k1;
        k1 = a * k1 + k2;
        k2 = aux;
        b = 1 / (b - a);
    } while (Math.abs(num - h1 / k1) > num * tolerance);

    // Limit to 32-bit uint
    if (h1 > 0xFFFFFFFF || k1 > 0xFFFFFFFF) {
       // Fallback for large numbers/overflow: simplified
       // E.g. for exposure time 1/500 -> 1, 500
       if (num < 1) {
           return [1, Math.round(1/num)];
       }
       return [Math.round(num * 10000), 10000];
    }

    return [h1, k1];
};


export function buildExifBuffer(metadata) {
    if (!metadata) return null;

    // We will build a Little Endian TIFF structure
    const littleEndian = true;

    // We need two IFDs: IFD0 (Main) and ExifIFD (Sub)
    // IFD0 will contain Make, Model, ExifOffset
    // ExifIFD will contain the rest

    // 1. Prepare Entries
    const ifd0Entries = [];
    const exifEntries = [];

    // Helper to add entry
    const addEntry = (list, tagName, val) => {
        if (val === undefined || val === null) return;
        const tagId = TAGS[tagName];
        if (!tagId) return;

        let type, count, valueBytes;
        let finalVal = val;

        // Determine Type & Format
        if (typeof val === 'string') {
            type = TYPES.ASCII;
            count = val.length + 1; // + null
            valueBytes = count;
        } else if (typeof val === 'number') {
            // Heuristics for type
            if (tagName === 'ISOSpeedRatings' || tagName === 'ISOSpeed') {
                type = TYPES.SHORT;
                count = 1;
                valueBytes = 2;
            } else if (tagName.includes('Time') && tagName !== 'DateTimeOriginal') {
                 // ExposureTime is Rational
                 type = TYPES.RATIONAL;
                 count = 1;
                 valueBytes = 8;
                 finalVal = toRational(val);
            } else if (tagName === 'FNumber' || tagName === 'FocalLength' || tagName === 'ApertureValue') {
                type = TYPES.RATIONAL;
                count = 1;
                valueBytes = 8;
                finalVal = toRational(val);
            } else {
                 // Default to Short
                 type = TYPES.SHORT;
                 count = 1;
                 valueBytes = 2;
            }
        } else if (Array.isArray(val)) {
             // Assume Rational passed as array [num, den]
             type = TYPES.RATIONAL;
             count = 1;
             valueBytes = 8;
        }

        list.push({ tag: tagId, type, count, valueBytes, value: finalVal });
    };

    // IFD0 Tags
    addEntry(ifd0Entries, 'Make', metadata.Make);
    addEntry(ifd0Entries, 'Model', metadata.Model);

    // Exif Tags
    addEntry(exifEntries, 'ExposureTime', metadata.ExposureTime);
    addEntry(exifEntries, 'FNumber', metadata.FNumber);
    addEntry(exifEntries, 'ISOSpeedRatings', metadata.ISOSpeedRatings || metadata.ISOSpeed);
    addEntry(exifEntries, 'DateTimeOriginal', metadata.DateTimeOriginal);
    addEntry(exifEntries, 'OffsetTimeOriginal', metadata.OffsetTimeOriginal);
    addEntry(exifEntries, 'FocalLength', metadata.FocalLength);
    addEntry(exifEntries, 'SubSecTimeOriginal', metadata.SubSecTimeOriginal);
    addEntry(exifEntries, 'LensModel', metadata.LensModel);

    // Calculate Sizes
    // Header: 8 bytes
    // IFD0: 2 + (12 * count) + 4 (Next Offset)
    // ExifIFD: 2 + (12 * count) + 4 (Next Offset)
    // Value Data: sum of values > 4 bytes

    // Need to insert ExifOffset tag into IFD0
    // ExifOffset is LONG (4 bytes), value fits in offset field.
    ifd0Entries.push({
        tag: TAGS.ExifOffset,
        type: TYPES.LONG,
        count: 1,
        valueBytes: 4,
        value: 0 // Placeholder
    });

    // Sort entries by Tag ID (Required by TIFF)
    ifd0Entries.sort((a,b) => a.tag - b.tag);
    exifEntries.sort((a,b) => a.tag - b.tag);

    const headerSize = 8;
    const ifd0Size = 2 + (ifd0Entries.length * 12) + 4;
    const exifIfdSize = 2 + (exifEntries.length * 12) + 4;

    // Calculate Data Offsets
    // Structure:
    // [Header 8]
    // [IFD0 Block]
    // [ExifIFD Block]
    // [IFD0 Large Values]
    // [ExifIFD Large Values]

    let currentOffset = headerSize;

    const ifd0Offset = currentOffset;
    currentOffset += ifd0Size;

    const exifIfdOffset = currentOffset;
    currentOffset += exifIfdSize;

    // Update ExifOffset in IFD0
    const exifOffsetEntry = ifd0Entries.find(e => e.tag === TAGS.ExifOffset);
    if (exifOffsetEntry) exifOffsetEntry.value = exifIfdOffset;

    // Calculate value offsets
    const ifd0ValuesOffset = currentOffset;
    let tempOffset = ifd0ValuesOffset;

    ifd0Entries.forEach(e => {
        if (e.valueBytes > 4) {
            e.offset = tempOffset;
            tempOffset += e.valueBytes + (e.valueBytes % 2); // Word alignment? TIFF doesn't strictly require, but good practice
        }
    });

    const exifValuesOffset = tempOffset;
    tempOffset = exifValuesOffset;

    exifEntries.forEach(e => {
        if (e.valueBytes > 4) {
            e.offset = tempOffset;
            tempOffset += e.valueBytes + (e.valueBytes % 2);
        }
    });

    const totalSize = tempOffset;
    const buffer = new Uint8Array(totalSize);
    const view = new DataView(buffer.buffer);

    // Write Header
    view.setUint16(0, 0x4949, littleEndian); // 'II'
    view.setUint16(2, 0x002A, littleEndian); // 42
    view.setUint32(4, ifd0Offset, littleEndian); // Offset to IFD0

    // Write IFD
    const writeIFD = (offset, entries, nextOffset) => {
        view.setUint16(offset, entries.length, littleEndian);
        let ptr = offset + 2;

        entries.forEach(e => {
            view.setUint16(ptr, e.tag, littleEndian);
            view.setUint16(ptr + 2, e.type, littleEndian);
            view.setUint32(ptr + 4, e.count, littleEndian);

            if (e.valueBytes > 4) {
                // Write offset to value
                view.setUint32(ptr + 8, e.offset, littleEndian);
                // Write actual value at offset
                writeValue(view, e.offset, e.type, e.value, littleEndian);
            } else {
                // Write value directly (left-aligned in 4 bytes usually? No, "stored in the Value Offset field")
                // For little endian, just write it at ptr+8
                writeValue(view, ptr + 8, e.type, e.value, littleEndian);
            }
            ptr += 12;
        });

        view.setUint32(ptr, nextOffset, littleEndian);
    };

    // Write IFD0
    writeIFD(ifd0Offset, ifd0Entries, 0); // 0 = No Next IFD

    // Write ExifIFD
    writeIFD(exifIfdOffset, exifEntries, 0);

    // Prepend 'Exif\0\0' for JPEG APP1?
    // ImageMagick setProfile('exif') usually expects the payload of the APP1 segment,
    // which *includes* "Exif\0\0" followed by the TIFF header.
    // However, some implementations might just want the TIFF blob.
    // Let's wrap it in the standard APP1 Exif prefix just in case.

    // Check documentation or standard:
    // "The EXIF profile is a JPEG APP1 marker. It consists of the length, the identifier 'Exif\0\0', and the TIFF header."
    // ImageMagick setProfile usually takes the raw data *content*.
    // Adding the 'Exif\0\0' header is safe for generic EXIF blobs.

    const prefix = new Uint8Array([69, 120, 105, 102, 0, 0]); // "Exif\0\0"
    const finalBuffer = new Uint8Array(prefix.length + buffer.length);
    finalBuffer.set(prefix);
    finalBuffer.set(buffer, prefix.length);

    return finalBuffer;
}
