// Diablo II string tables (.tbl): a 21-byte header, a u16 index per string, then a hash table of
// 17-byte nodes. Keys and values are UTF-8 (the colour code byte ÿ is C3 BF). Pure, so it runs in
// Vite, Vitest and Node tools; it takes bytes, never a path.

const HEADER_SIZE = 21;
const NODE_SIZE = 17;

const utf8 = new TextDecoder("utf-8", {fatal: true});

// bytes: a Uint8Array of the whole file. Returns a Map of key -> string. A key stored more than once
// resolves the way the game's lookup does: probing from the key's hash modulo the table size, the first
// active node with that key wins (file order would give the wrong answer for 6 of SoE's keys). Nodes
// with an empty key are skipped: the game never looks one up.
export function parseTbl(bytes) {
    if (bytes.length < HEADER_SIZE) throw new Error(`.tbl: ${bytes.length} bytes is shorter than the header`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint16(2, true);
    const hashSize = view.getUint32(4, true);
    const fileSize = view.getUint32(17, true);
    if (fileSize !== bytes.length) throw new Error(`.tbl: the header says ${fileSize} bytes, the file has ${bytes.length}`);
    const nodesAt = HEADER_SIZE + 2 * count;
    if (nodesAt + hashSize * NODE_SIZE > bytes.length) throw new Error(".tbl: the hash table runs past the end of the file");

    const text = (start, end, what) => {
        try {
            return utf8.decode(bytes.subarray(start, end));
        } catch {
            throw new Error(`.tbl: ${what} at byte ${start} is not valid UTF-8`);
        }
    };

    // key -> {slot, distance}: the node the game's probe reaches first.
    const best = new Map();
    for (let slot = 0; slot < hashSize; slot++) {
        const at = nodesAt + slot * NODE_SIZE;
        if (!bytes[at]) continue;
        const hash = view.getUint32(at + 3, true);
        const keyAt = view.getUint32(at + 7, true);
        const keyEnd = bytes.indexOf(0, keyAt);
        const key = text(keyAt, keyEnd < 0 ? bytes.length : keyEnd, "a key");
        if (!key) continue;
        const distance = (slot - (hash % hashSize) + hashSize) % hashSize;
        const seen = best.get(key);
        if (!seen || distance < seen.distance) best.set(key, {slot, distance});
    }

    const strings = new Map();
    for (const [key, {slot}] of best) {
        const at = nodesAt + slot * NODE_SIZE;
        const valueAt = view.getUint32(at + 11, true);
        const length = view.getUint16(at + 15, true);
        let end = valueAt + length;
        while (end > valueAt && bytes[end - 1] === 0) end--;
        strings.set(key, text(valueAt, end, `the value of "${key}"`));
    }
    return strings;
}
