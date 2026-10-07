import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { DROP_CALC_FILE, DROP_CALC_TABLES, tablesToJson } from './src/dropCalcData.js'

const DROP_CALC_MODES = ['standard', 'damnation']

// Writes public/data/<mode>/DropCalculator.json from that folder's .txt tables (src/dropCalcData.js).
// It runs in configResolved, before the dev server lists public/ (a file first written in buildStart
// could 404 until a restart), and again in dev when one of those .txt files changes. Skipped under
// Vitest (mode "test") and vite preview (which only serves dist/). The JSON is gitignored.
function dropCalcData() {
  let skip = false
  let dataDir = ''

  function generate(mode) {
    const dir = path.join(dataDir, mode)
    const texts = Object.fromEntries(DROP_CALC_TABLES.map((name) => [name, readFileSync(path.join(dir, `${name}.txt`), 'utf8')]))
    const json = JSON.stringify(tablesToJson(texts))
    const out = path.join(dir, DROP_CALC_FILE)
    if (!existsSync(out) || readFileSync(out, 'utf8') !== json) writeFileSync(out, json)
  }

  return {
    name: 'drop-calc-data',
    config(_, env) {
      skip = env.mode === 'test' || !!env.isPreview
    },
    configResolved(config) {
      if (skip || !config.publicDir) return
      dataDir = path.join(config.publicDir, 'data')
      for (const mode of DROP_CALC_MODES) {
        try {
          generate(mode)
        } catch (e) {
          // A build must not ship without the calculator's data; the dev server keeps running.
          if (config.command === 'build') throw e
          config.logger.error(`drop-calc-data: ${mode}: ${e.message}`)
        }
      }
    },
    configureServer(server) {
      if (!dataDir) return
      server.watcher.on('change', (file) => {
        const [mode, name, ...rest] = path.relative(dataDir, file).split(path.sep)
        if (rest.length || !DROP_CALC_MODES.includes(mode) || !name?.endsWith('.txt')) return
        try {
          generate(mode)
          server.config.logger.info(`drop-calc-data: regenerated ${mode}/${DROP_CALC_FILE}`)
        } catch (e) {
          server.config.logger.error(`drop-calc-data: ${mode}: ${e.message}`)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dropCalcData()],
  base: '/TheArchivistSoE/'
})
