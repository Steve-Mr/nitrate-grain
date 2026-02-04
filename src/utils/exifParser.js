
/* eslint-disable no-console */
/**
 * Lightweight EXIF Parser for RAW/TIFF files.
 * Extracts specific metadata tags needed for export.
 */

const TAGS = {
    // IFD0
    0x010F: 'Make',
    0x0110: 'Model',
    0x8769: 'ExifOffset', // Pointer to Exif IFD

    // Exif IFD
    0x829a: 'ExposureTime',
    0x829d: 'FNumber',
    0x8827: 'ISOSpeedRatings', // Often used for ISO
    0x8833: 'ISOSpeed',        // Alternative ISO
    0x9003: 'DateTimeOriginal',
    0x9011: 'OffsetTimeOriginal',
    0x920a: 'FocalLength',
    0x9291: 'SubSecTimeOriginal',
    0xa434: 'LensModel'
};

const TYPES = {
    1: 'BYTE',      // 8-bit unsigned integer
    2: 'ASCII',     // 8-bit byte that contains a 7-bit ASCII code; the last byte must be NUL (binary zero)
    3: 'SHORT',     // 16-bit (2-byte) unsigned integer
    4: 'LONG',      // 32-bit (4-byte) unsigned integer
    5: 'RATIONAL',  // Two LONGs: the first represents the numerator of a fraction; the second, the denominator
    7: 'UNDEFINED', // An 8-bit byte that can take any value depending on the field definition
    9: 'SLONG',     // 32-bit (4-byte) signed integer (2's complement notation)
    10: 'SRATIONAL' // Two SLONGs: the first represents the numerator of a fraction, the second the denominator
};

const TYPE_SIZES = {
    1: 1,
    2: 1,
    3: 2,
    4: 4,
    5: 8,
    7: 1,
    9: 4,
    10: 8
};

export function parseExif(buffer) {
    const dataView = new DataView(buffer);
    const result = {};

    try {
        // 1. TIFF Header
        const byteOrder = dataView.getUint16(0);
        const littleEndian = byteOrder === 0x4949; // 'II'

        if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) {
            console.warn("Invalid TIFF byte order:", byteOrder.toString(16));
            return result;
        }

        const magic = dataView.getUint16(2, littleEndian);
        if (magic !== 42) { // 0x002A
            console.warn("Invalid TIFF magic number:", magic);
            return result;
        }

        const firstIFDOffset = dataView.getUint32(4, littleEndian);
        if (firstIFDOffset < 8) {
            console.warn("Invalid first IFD offset:", firstIFDOffset);
            return result;
        }

        // Helper to read values
        const readValue = (type, count, offset) => {
            switch (type) {
                case 2: // ASCII
                    // Read string, ignore null terminator
                    let str = '';
                    for (let i = 0; i < count; i++) {
                        const charCode = dataView.getUint8(offset + i);
                        if (charCode === 0) break;
                        str += String.fromCharCode(charCode);
                    }
                    return str;

                case 3: // SHORT
                    if (count === 1) return dataView.getUint16(offset, littleEndian);
                    const shorts = [];
                    for(let i=0; i<count; i++) shorts.push(dataView.getUint16(offset + i*2, littleEndian));
                    return shorts;

                case 4: // LONG
                    if (count === 1) return dataView.getUint32(offset, littleEndian);
                    const longs = [];
                    for(let i=0; i<count; i++) longs.push(dataView.getUint32(offset + i*4, littleEndian));
                    return longs;

                case 5: // RATIONAL
                case 10: // SRATIONAL
                    if (count === 1) {
                        const num = dataView.getUint32(offset, littleEndian);
                        const den = dataView.getUint32(offset + 4, littleEndian);
                        return den === 0 ? 0 : num / den;
                    }
                    // For multiple rationals (unlikely for our tags, maybe logic later if needed)
                    return null;

                default:
                    // For other types, just return raw value or ignore for now
                    return null;
            }
        };

        const parseIFD = (offset) => {
            if (offset >= buffer.byteLength) return;

            const entryCount = dataView.getUint16(offset, littleEndian);
            let currentOffset = offset + 2;

            for (let i = 0; i < entryCount; i++) {
                if (currentOffset + 12 > buffer.byteLength) break;

                const tag = dataView.getUint16(currentOffset, littleEndian);
                const type = dataView.getUint16(currentOffset + 2, littleEndian);
                const count = dataView.getUint32(currentOffset + 4, littleEndian);
                let valueOffset = dataView.getUint32(currentOffset + 8, littleEndian); // Value or Offset

                const typeSize = TYPE_SIZES[type] || 0;
                const totalSize = typeSize * count;

                // If value fits in 4 bytes, it IS the value (left aligned? no, depends on endianness but usually packed)
                // Actually in TIFF: "If the value fits into 4 bytes, the value is stored in the Value Offset field. If the value does not fit..."
                let finalValueOffset = valueOffset; // Default assume it's an offset

                if (totalSize <= 4) {
                    // It's the value itself, stored inside the 4 bytes at currentOffset + 8
                    finalValueOffset = currentOffset + 8;
                }

                if (TAGS[tag]) {
                    const tagName = TAGS[tag];

                    if (tagName === 'ExifOffset') {
                        // Recurse into Exif IFD
                        parseIFD(valueOffset);
                    } else {
                        // Extract Value
                        const val = readValue(type, count, finalValueOffset);
                        if (val !== null) {
                            result[tagName] = val;
                        }
                    }
                }

                currentOffset += 12;
            }
        };

        // 2. Parse IFD0
        parseIFD(firstIFDOffset);

        // Fallback for ISO if ISOSpeedRatings missing
        if (!result.ISOSpeedRatings && result.ISOSpeed) {
            result.ISOSpeedRatings = result.ISOSpeed;
        }

    } catch (err) {
        console.error("EXIF Parsing failed:", err);
    }

    return result;
}
