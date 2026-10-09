import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { DROP_CALC_FILE, DROP_CALC_TABLES, tablesToJson } from './src/dropCalcData.js'
import { ITEM_BUILDER_FILE, ITEM_BUILDER_JSON_FILES, ITEM_BUILDER_TABLES, buildItemBuilderJson, linkFingerprint, resolveLinkVersion } from './src/itemBuilderData.js'

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
      const onTxt = (file) => {
        const [mode, name, ...rest] = path.relative(dataDir, file).split(path.sep)
        if (rest.length || !DROP_CALC_MODES.includes(mode) || !name?.endsWith('.txt')) return
        try {
          generate(mode)
          server.config.logger.info(`drop-calc-data: regenerated ${mode}/${DROP_CALC_FILE}`)
        } catch (e) {
          server.config.logger.error(`drop-calc-data: ${mode}: ${e.message}`)
        }
      }
      // 'add' too: a table that was missing at startup, or written as a delete then create.
      server.watcher.on('change', onTxt)
      server.watcher.on('add', onTxt)
    },
  }
}

// Writes public/data/standard/ItemBuilder.json from the standard .txt tables plus Affixes/Weapons/
// Armors.json (src/itemBuilderData.js), with the link version from src/itemBuilderVersion.json. In dev
// a change in what links depend on bumps that version and rewrites the file (commit it); a build fails
// instead. Same timing as drop-calc-data; skipped under Vitest and vite preview. The JSON is gitignored.
function itemBuilderData() {
  let skip = false
  let dataDir = ''
  let versionFile = ''
  let command = 'serve'

  function generate(logger) {
    const texts = Object.fromEntries(ITEM_BUILDER_TABLES.map((name) => [name, readFileSync(path.join(dataDir, 'standard', `${name}.txt`), 'utf8')]))
    const [affixesJson, weaponsJson, armorsJson] = ITEM_BUILDER_JSON_FILES.map((f) => JSON.parse(readFileSync(path.join(dataDir, f), 'utf8')))
    const { json, warnings } = buildItemBuilderJson({ texts, affixesJson, weaponsJson, armorsJson })
    for (const w of warnings) logger.warn(`item-builder-data: ${w}`)

    const fingerprint = linkFingerprint(json)
    const stored = existsSync(versionFile) ? JSON.parse(readFileSync(versionFile, 'utf8')) : null
    const { version, write } = resolveLinkVersion({ fingerprint, stored, command })
    if (write) {
      writeFileSync(versionFile, JSON.stringify({ version, fingerprint }, null, 2) + '\n')
      logger.warn(`item-builder-data: link version set to ${version} (commit src/itemBuilderVersion.json)`)
    }

    const out = path.join(dataDir, 'standard', ITEM_BUILDER_FILE)
    const text = JSON.stringify({ ...json, linkVersion: version })
    if (!existsSync(out) || readFileSync(out, 'utf8') !== text) writeFileSync(out, text)
  }

  return {
    name: 'item-builder-data',
    config(_, env) {
      skip = env.mode === 'test' || !!env.isPreview
    },
    configResolved(config) {
      if (skip || !config.publicDir) return
      dataDir = path.join(config.publicDir, 'data')
      versionFile = path.join(config.root, 'src', 'itemBuilderVersion.json')
      command = config.command
      try {
        generate(config.logger)
      } catch (e) {
        // A build must not ship without the builder's data; the dev server keeps running.
        if (config.command === 'build') throw e
        config.logger.error(`item-builder-data: ${e.message}`)
      }
    },
    configureServer(server) {
      if (!dataDir) return
      const sources = new Set([
        ...ITEM_BUILDER_TABLES.map((name) => path.join(dataDir, 'standard', `${name}.txt`)),
        ...ITEM_BUILDER_JSON_FILES.map((f) => path.join(dataDir, f)),
      ])
      const onFile = (file) => {
        if (!sources.has(path.resolve(file))) return
        try {
          generate(server.config.logger)
          server.config.logger.info(`item-builder-data: regenerated standard/${ITEM_BUILDER_FILE}`)
        } catch (e) {
          server.config.logger.error(`item-builder-data: ${e.message}`)
        }
      }
      server.watcher.on('change', onFile)
      server.watcher.on('add', onFile)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dropCalcData(), itemBuilderData()],
  base: '/TheArchivistSoE/'
})
