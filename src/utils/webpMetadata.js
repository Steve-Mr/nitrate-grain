/**
 * Inserts an EXIF chunk into a WebP buffer.
 * @param {ArrayBuffer} webpBuffer - The original WebP buffer
 * @param {Uint8Array} rawExif - The raw EXIF data (starts with II/MM, NO Exif header)
 * @returns {ArrayBuffer} New WebP buffer with EXIF chunk
 */
export function insertExifIntoWebp(webpBuffer, rawExif) {
    if (!rawExif) return webpBuffer;

    const data = new Uint8Array(webpBuffer);

    // WebP RIFF Header: "RIFF" (4) + File Size (4) + "WEBP" (4)
    if (data[0] !== 0x52 || data[1] !== 0x49 || data[2] !== 0x46 || data[3] !== 0x46) return webpBuffer;

    // WebP (Simple) usually has "VP8 " or "VP8L" or "VP8X" chunk.
    // If it's Simple (VP8/VP8L only), we MUST upgrade it to Extended (VP8X) to add metadata.
    // However, canvas.toBlob("image/webp") often produces simple format if no alpha/anim.

    // For robust implementation, we need to check if VP8X exists.
    // Chunk Header: Tag (4) + Size (4 LE).

    let hasVp8x = false;
    let vp8xOffset = 12;

    // Check first chunk (at 12)
    if (data[12] === 0x56 && data[13] === 0x50 && data[14] === 0x38 && data[15] === 0x58) { // "VP8X"
        hasVp8x = true;
    }

    // If no VP8X, we need to create one.
    // This is complicated because we need to know image width/height/alpha/anim to build VP8X.
    // Parsing VP8/VP8L headers is required.

    // Strategy:
    // If we rely on the browser's `canvas.toBlob`, we might get either.
    // If we assume we can just append an EXIF chunk at the end (allowed in Extended), it might fail in Simple viewers.
    // But the spec says EXIF metadata *requires* the file to be in Extended format.

    // Simplification for this task:
    // We will attempt to wrap the existing data in an Extended format if not already.
    // But getting width/height from the bitstream is hard without a parser.
    // Wait, the worker received `width` and `height`! We can use that.

    // Construct new file:
    // 1. RIFF Header
    // 2. VP8X Chunk (Flags: hasExif=1)
    // 3. Image Data (original chunks)
    // 4. EXIF Chunk

    // Check current structure.
    // If starts with VP8X, modify flags and insert EXIF.
    // If starts with VP8/VP8L, prepend VP8X and append EXIF.

    const width = 0; // We need this passed in!
    // Wait, this utility function signature doesn't have width/height.
    // I should update the function signature or try to read it.
    // Reading VP8/VP8L header for dimensions is safer.

    // Let's implement a basic dimension reader.

    return webpBuffer; // Placeholder until we confirm we can get dimensions or pass them.
}

/**
 * Enhanced version that accepts dimensions to build VP8X if needed.
 */
export function insertExifIntoWebpWithDimensions(webpBuffer, rawExif, width, height) {
    if (!rawExif) return webpBuffer;

    const data = new Uint8Array(webpBuffer);

    // 1. Check basic validity
    if (data[0] !== 0x52 || data[1] !== 0x49 || data[2] !== 0x46 || data[3] !== 0x46) return webpBuffer; // RIFF

    // 2. Check if VP8X exists
    let hasVp8x = false;
    if (data[12] === 0x56 && data[13] === 0x50 && data[14] === 0x38 && data[15] === 0x58) {
        hasVp8x = true;
    }

    let newChunks = [];
    let currentOffset = 12;

    if (hasVp8x) {
        // Read existing VP8X
        const vp8xSize = (data[16] | (data[17] << 8) | (data[18] << 16) | (data[19] << 24));
        const vp8xContent = data.subarray(20, 20 + vp8xSize);

        // Modify Flags (Byte 0 of content) to set EXIF bit (0x08)
        const flags = vp8xContent[0] | 0x08;

        // Rebuild VP8X
        const newVp8x = new Uint8Array(18); // Tag(4) + Size(4) + Content(10)
        newVp8x.set([0x56, 0x50, 0x38, 0x58], 0); // VP8X
        newVp8x[4] = 10; newVp8x[5] = 0; newVp8x[6] = 0; newVp8x[7] = 0; // Size 10
        newVp8x[8] = flags;
        // Copy rest of VP8X content (bytes 1-9)
        newVp8x.set(vp8xContent.subarray(1), 9);

        newChunks.push(newVp8x);
        currentOffset += 8 + vp8xSize;
    } else {
        // Create VP8X
        const newVp8x = new Uint8Array(18);
        newVp8x.set([0x56, 0x50, 0x38, 0x58], 0);
        newVp8x[4] = 10; newVp8x[5] = 0; newVp8x[6] = 0; newVp8x[7] = 0;

        // Flags: EXIF (0x08). Alpha?
        // We don't know if original has alpha easily without scanning.
        // But usually if it's VP8L it has alpha. VP8 usually doesn't.
        // Let's assume no Alpha for safely unless we detect VP8L?
        // Actually, if we set the Alpha flag wrong, it might break.
        // Safe bet: Check if first chunk is VP8L.
        const firstChunkTag = String.fromCharCode(data[12], data[13], data[14], data[15]);
        let flags = 0x08; // Exif
        if (firstChunkTag === "VP8L") {
            flags |= 0x10; // Alpha (usually VP8L has alpha capability)
        }

        newVp8x[8] = flags;
        newVp8x[9] = 0; newVp8x[10] = 0; // Reserved

        // Canvas Width - 1 (24 bit)
        const w = width - 1;
        newVp8x[11] = w & 0xFF;
        newVp8x[12] = (w >> 8) & 0xFF;
        newVp8x[13] = (w >> 16) & 0xFF;

        // Canvas Height - 1 (24 bit)
        const h = height - 1;
        newVp8x[14] = h & 0xFF;
        newVp8x[15] = (h >> 8) & 0xFF;
        newVp8x[16] = (h >> 16) & 0xFF;

        newChunks.push(newVp8x);
    }

    // 3. Copy Image Data Chunks (VP8, VP8L, ALPH...)
    // Iterate chunks until we hit metadata or EOF
    // Note: EXIF must come AFTER image data but BEFORE XMP.

    while (currentOffset < data.length) {
        const tag = String.fromCharCode(data[currentOffset], data[currentOffset+1], data[currentOffset+2], data[currentOffset+3]);
        const size = (data[currentOffset+4] | (data[currentOffset+5] << 8) | (data[currentOffset+6] << 16) | (data[currentOffset+7] << 24));

        // If we hit an existing EXIF chunk, skip it (we overwrite)
        if (tag === 'EXIF') {
            currentOffset += 8 + size + (size % 2);
            continue;
        }

        const chunkTotal = 8 + size + (size % 2);
        const chunkData = data.subarray(currentOffset, currentOffset + chunkTotal);
        newChunks.push(chunkData);
        currentOffset += chunkTotal;
    }

    // 4. Create EXIF Chunk
    // Header: "EXIF"
    const exifSize = rawExif.length;
    const exifChunk = new Uint8Array(8 + exifSize + (exifSize % 2));
    exifChunk.set([0x45, 0x58, 0x49, 0x46], 0); // EXIF
    exifChunk[4] = exifSize & 0xFF;
    exifChunk[5] = (exifSize >> 8) & 0xFF;
    exifChunk[6] = (exifSize >> 16) & 0xFF;
    exifChunk[7] = (exifSize >> 24) & 0xFF;

    exifChunk.set(rawExif, 8);
    // Padding byte is already 0 if initialized

    newChunks.push(exifChunk);

    // 5. Reassemble RIFF
    const totalFileSize = newChunks.reduce((acc, c) => acc + c.length, 0) + 4; // +4 for "WEBP"

    const finalBuffer = new Uint8Array(8 + totalFileSize);

    // RIFF Header
    finalBuffer.set([0x52, 0x49, 0x46, 0x46], 0);
    finalBuffer[4] = totalFileSize & 0xFF;
    finalBuffer[5] = (totalFileSize >> 8) & 0xFF;
    finalBuffer[6] = (totalFileSize >> 16) & 0xFF;
    finalBuffer[7] = (totalFileSize >> 24) & 0xFF;

    // WEBP
    finalBuffer.set([0x57, 0x45, 0x42, 0x50], 8);

    let writePos = 12;
    for (const chunk of newChunks) {
        finalBuffer.set(chunk, writePos);
        writePos += chunk.length;
    }

    return finalBuffer.buffer;
}
