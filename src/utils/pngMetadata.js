/**
 * Inserts an eXIf chunk into a PNG buffer.
 * @param {ArrayBuffer} pngBuffer - The original PNG buffer
 * @param {Uint8Array} rawExif - The raw EXIF data (starts with II/MM, NO Exif header)
 * @returns {ArrayBuffer} New PNG buffer with eXIf chunk
 */
export function insertExifIntoPng(pngBuffer, rawExif) {
    if (!rawExif) return pngBuffer;

    const data = new Uint8Array(pngBuffer);

    // PNG Signature: 89 50 4E 47 0D 0A 1A 0A
    if (data[0] !== 0x89 || data[1] !== 0x50) return pngBuffer;

    // We want to insert eXIf chunk before IDAT (image data), usually after IHDR.
    // Technically can be anywhere before IEND, but before IDAT is safest for metadata.
    // Let's iterate chunks to find IHDR, then insert after it.

    let offset = 8; // Skip signature
    let insertPos = -1;

    while (offset < data.length) {
        // Chunk Length (4 bytes)
        const length = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
        // Chunk Type (4 bytes)
        // const type = String.fromCharCode(data[offset+4], data[offset+5], data[offset+6], data[offset+7]);

        const typeStart = offset + 4;

        // Check for IHDR (0x49 0x48 0x44 0x52)
        if (data[typeStart] === 0x49 && data[typeStart+1] === 0x48 && data[typeStart+2] === 0x44 && data[typeStart+3] === 0x52) {
            // Found IHDR. Insert AFTER this chunk.
            // Chunk = Length(4) + Type(4) + Data(length) + CRC(4)
            insertPos = offset + 8 + length + 4;
            break;
        }

        offset += 8 + length + 4;
    }

    if (insertPos === -1) {
        // Fallback: Just insert after signature? No, standard requires IHDR first.
        // If we didn't find IHDR, it's a bad PNG.
        return pngBuffer;
    }

    // Construct eXIf chunk
    // Length (4) + Type (4) + Data + CRC (4)
    const chunkType = [0x65, 0x58, 0x49, 0x66]; // "eXIf"
    const chunkLen = rawExif.length;
    const chunkTotalSize = 12 + chunkLen;

    const chunkBuffer = new Uint8Array(chunkTotalSize);
    const view = new DataView(chunkBuffer.buffer);

    // Length
    view.setUint32(0, chunkLen, false); // Big Endian

    // Type
    chunkBuffer.set(chunkType, 4);

    // Data
    chunkBuffer.set(rawExif, 8);

    // CRC
    // We need a CRC32 implementation.
    const crc = calculateCrc32(chunkBuffer.subarray(4, 8 + chunkLen));
    view.setUint32(8 + chunkLen, crc, false); // Big Endian

    // Merge
    const newBuffer = new Uint8Array(data.length + chunkTotalSize);
    newBuffer.set(data.subarray(0, insertPos), 0);
    newBuffer.set(chunkBuffer, insertPos);
    newBuffer.set(data.subarray(insertPos), insertPos + chunkTotalSize);

    return newBuffer.buffer;
}

// CRC32 Table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        if (c & 1) c = 0xedb88320 ^ (c >>> 1);
        else c = c >>> 1;
    }
    crcTable[n] = c;
}

function calculateCrc32(buffer) {
    let c = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) {
        c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
    }
    return c ^ 0xffffffff;
}
