// Pixel diff of two screenshot sets: node diff-shots.mjs <labelA> <labelB>
import {readdirSync, readFileSync} from "node:fs";
import {run} from "./cdp.mjs";

const [a, b] = process.argv.slice(2).map((l) => new URL(`./shots/desktop-${l}/`, import.meta.url).pathname);

await run(async (page) => {
    await page.goto("about:blank");
    for (const file of readdirSync(a).filter((f) => f.endsWith(".png")).sort()) {
        const src = (dir) => `data:image/png;base64,${readFileSync(dir + file).toString("base64")}`;
        const r = await page.eval(`(async () => {
            const load = (s) => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = s; });
            const [x, y] = await Promise.all([load(${JSON.stringify(src(a))}), load(${JSON.stringify(src(b))})]);
            if (x.width !== y.width || x.height !== y.height) return {size: [x.width, x.height, y.width, y.height]};
            const px = (img) => {
                const c = document.createElement("canvas");
                c.width = img.width; c.height = img.height;
                const ctx = c.getContext("2d");
                ctx.drawImage(img, 0, 0);
                return ctx.getImageData(0, 0, c.width, c.height).data;
            };
            const p = px(x), q = px(y);
            let n = 0, minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
            for (let i = 0; i < p.length; i += 4) {
                if (p[i] !== q[i] || p[i + 1] !== q[i + 1] || p[i + 2] !== q[i + 2]) {
                    n++;
                    const k = i / 4, cx = k % x.width, cy = (k - cx) / x.width;
                    minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
                }
            }
            return {diffPixels: n, bbox: n ? [minX, minY, maxX, maxY] : null};
        })()`);
        console.log(file.padEnd(20), JSON.stringify(r));
    }
});
