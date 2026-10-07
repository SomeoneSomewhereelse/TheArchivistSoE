// Loads the Drop calculator's data for one mode: DropCalculator.json (generated from the .txt tables
// by the drop-calc-data plugin in vite.config.js), fetched once per mode per page load and prepared.
import {DROP_CALC_FILE, jsonToTables} from "./dropCalcData.js";
import {prepareModel} from "./dropCalcEngine.js";

const cache = new Map();

async function fetchModel(mode) {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${mode}/${DROP_CALC_FILE}`, {cache: "no-store"});
    if (!res.ok) throw new Error(`${DROP_CALC_FILE}: HTTP ${res.status}`);
    return prepareModel(jsonToTables(await res.json()));
}

// A failed load is evicted, so the next query tries again.
export function loadModel(damnationMode) {
    const mode = damnationMode ? "damnation" : "standard";
    let promise = cache.get(mode);

    if (!promise) {
        promise = fetchModel(mode);
        cache.set(mode, promise);
        promise.catch(() => {
            if (cache.get(mode) === promise) cache.delete(mode);
        });
    }

    return promise;
}
