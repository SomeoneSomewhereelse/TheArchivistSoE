import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { DROP_CALC_FILE, DROP_CALC_TABLES, tablesToJson } from './src/dropCalcData.js'
import { ITEM_BUILDER_FILE, ITEM_BUILDER_JSON_FILES, ITEM_BUILDER_TABLES, buildItemBuilderJson, linkFingerprint, resolveLinkVersion } from './src/itemBuilderData.js'
import { AFFIXES_FILE, AFFIX_TABLES, affixesJson, describeAffixes, itemTypeNames, readAffixes } from './src/affixData.js'
import { STAT_TABLES, buildStatData } from './src/statData.js'
import { parseTbl } from './src/tblFile.js'

const DROP_CALC_MODES = ['standard', 'damnation']

// The game tables keep their paths inside the game's MPQs, under public/data/<mode>/.
const EXCEL_DIR = path.join('data', 'global', 'excel')
const PATCH_STRINGS = path.join('data', 'local', 'LNG', 'ENG', 'patchstring.tbl')

const writeIfChanged = (file, text) => {
  if (!existsSync(file) || readFileSync(file, 'utf8') !== text) writeFileSync(file, text)
}

// Writes public/data/<mode>/DropCalculator.json from that mode's data/global/excel/ tables
// (src/dropCalcData.js). It runs in configResolved, before the dev server lists public/ (a file first
// written in buildStart could 404 until a restart), and again in dev when one of those .txt files changes.
// Skipped under Vitest (mode "test") and vite preview (which only serves dist/). The JSON is gitignored.
function dropCalcData() {
  let skip = false
  let dataDir = ''

  function generate(mode) {
    const dir = path.join(dataDir, mode)
    const texts = Object.fromEntries(DROP_CALC_TABLES.map((name) => [name, readFileSync(path.join(dir, EXCEL_DIR, `${name}.txt`), 'utf8')]))
    writeIfChanged(path.join(dir, DROP_CALC_FILE), JSON.stringify(tablesToJson(texts)))
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
        // <mode>/data/global/excel/<name>.txt: anything shallower or deeper is not a table.
        const [mode, ...rest] = path.relative(dataDir, file).split(path.sep)
        const name = rest.pop()
        if (rest.join('/') !== 'data/global/excel' || !DROP_CALC_MODES.includes(mode) || !name?.endsWith('.txt')) return
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

// Writes public/data/standard/Affixes.json and ItemBuilder.json. The affix rows come from the standard
// data/global/excel/ tables, described by the stat engine with SoE's patchstring.tbl and src/baseStrings.json
// (src/affixData.js); the builder adds bases and item types (src/itemBuilderData.js, with Weapons/Armors.json)
// and the link version from src/itemBuilderVersion.json. In dev a change in what links depend on bumps that
// version and rewrites the file (commit it); a build fails instead. Same timing as drop-calc-data; skipped
// under Vitest and vite preview. Both JSON files are gitignored.
function affixData() {
  let skip = false
  let dataDir = ''
  let root = ''
  let command = 'serve'
  const tables = [...new Set([...AFFIX_TABLES, ...ITEM_BUILDER_TABLES, ...STAT_TABLES])]
  const standard = () => path.join(dataDir, 'standard')
  const tablePath = (name) => path.join(standard(), EXCEL_DIR, `${name}.txt`)
  const baseStringsPath = () => path.join(root, 'src', 'baseStrings.json')

  function generate(logger) {
    const texts = Object.fromEntries(tables.map((name) => [name, readFileSync(tablePath(name), 'utf8')]))
    const dict = buildStatData({
      texts,
      patchStrings: parseTbl(new Uint8Array(readFileSync(path.join(standard(), PATCH_STRINGS)))),
      baseStrings: JSON.parse(readFileSync(baseStringsPath(), 'utf8')),
    })
    const { rows, stats, warnings } = describeAffixes(readAffixes(texts), dict, itemTypeNames(texts.ItemTypes))
    for (const w of warnings) logger.warn(`affix-data: ${w}`)
    writeIfChanged(path.join(standard(), AFFIXES_FILE), JSON.stringify(affixesJson({ rows, stats })))

    const [weaponsJson, armorsJson] = ITEM_BUILDER_JSON_FILES.map((f) => JSON.parse(readFileSync(path.join(dataDir, f), 'utf8')))
    const json = buildItemBuilderJson({ texts, affixes: rows, weaponsJson, armorsJson })
    const versionFile = path.join(root, 'src', 'itemBuilderVersion.json')
    const fingerprint = linkFingerprint(json)
    const stored = existsSync(versionFile) ? JSON.parse(readFileSync(versionFile, 'utf8')) : null
    const { version, write } = resolveLinkVersion({ fingerprint, stored, command })
    if (write) {
      writeFileSync(versionFile, JSON.stringify({ version, fingerprint }, null, 2) + '\n')
      logger.warn(`affix-data: link version set to ${version} (commit src/itemBuilderVersion.json)`)
    }
    writeIfChanged(path.join(standard(), ITEM_BUILDER_FILE), JSON.stringify({ ...json, linkVersion: version }))
  }

  return {
    name: 'affix-data',
    config(_, env) {
      skip = env.mode === 'test' || !!env.isPreview
    },
    configResolved(config) {
      if (skip || !config.publicDir) return
      dataDir = path.join(config.publicDir, 'data')
      root = config.root
      command = config.command
      try {
        generate(config.logger)
      } catch (e) {
        // A build must not ship without the affix data; the dev server keeps running.
        if (config.command === 'build') throw e
        config.logger.error(`affix-data: ${e.message}`)
      }
    },
    configureServer(server) {
      if (!dataDir) return
      const sources = new Set([
        ...tables.map(tablePath),
        path.join(standard(), PATCH_STRINGS),
        baseStringsPath(),
        ...ITEM_BUILDER_JSON_FILES.map((f) => path.join(dataDir, f)),
      ])
      const onFile = (file) => {
        if (!sources.has(path.resolve(file))) return
        try {
          generate(server.config.logger)
          server.config.logger.info(`affix-data: regenerated standard/${AFFIXES_FILE} and standard/${ITEM_BUILDER_FILE}`)
        } catch (e) {
          server.config.logger.error(`affix-data: ${e.message}`)
        }
      }
      server.watcher.on('change', onFile)
      server.watcher.on('add', onFile)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dropCalcData(), affixData()],
  base: '/TheArchivistSoE/'
})
