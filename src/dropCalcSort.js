// Sorting for the Drop calculator's result table. The engine returns rows by chance, highest first,
// which is DEFAULT_DROP_SORT, so the table looks unchanged until a header is clicked.

export const DEFAULT_DROP_SORT = {key: "chance", dir: "desc"};

// Sort key -> the row field it reads. Both chance columns (1:N and %) sort by chance.
const FIELDS = {monster: "monsterName", treasureClass: "treasureClass", level: "levelName", chance: "chance"};

// A new column starts in its natural direction (text A-Z, chance highest first); the same column flips.
export function nextDropSort(sort, key) {
    if (sort.key === key) return {key, dir: sort.dir === "asc" ? "desc" : "asc"};
    return {key, dir: key === "chance" ? "desc" : "asc"};
}

// A new array; rows tied on the key keep their incoming order in both directions (Array.sort is stable).
export function sortDropRows(rows, {key, dir}) {
    const field = FIELDS[key];
    const sign = dir === "asc" ? 1 : -1;
    const compare = key === "chance"
        ? (a, b) => a.chance - b.chance
        : (a, b) => String(a[field]).localeCompare(String(b[field]), undefined, {numeric: true, sensitivity: "base"});
    return [...rows].sort((a, b) => sign * compare(a, b));
}
