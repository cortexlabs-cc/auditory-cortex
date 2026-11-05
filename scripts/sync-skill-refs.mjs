// Copies docs/ and the demo synth into the agent skill's references/, because an installed
// plugin only gets its own folder. `--check` fails instead of writing (used by CI).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const refs = join(root, 'plugins/auditory-cortex/skills/auditory-cortex/references')

const FILES = {
  'getting-started.md': 'docs/getting-started.md',
  'bands-reference.md': 'docs/bands-reference.md',
  'r3f-components.md': 'docs/r3f-components.md',
  'recipes/spectral-colour.md': 'docs/recipes/spectral-colour.md',
  'recipes/composed-field.md': 'docs/recipes/composed-field.md',
  'demo-synth.ts': 'examples/src/demoSynth.ts',
}

// links that point outside docs/ in the source don't exist inside the plugin
const rewrite = (text) =>
  text.replace(/\]\(\.\.\/\.\.\/examples\/src\/([^)]+)\)/g, '](https://github.com/cortexlabs/auditory-cortex/blob/main/examples/src/$1)')

const check = process.argv.includes('--check')
let stale = 0
for (const [dest, src] of Object.entries(FILES)) {
  const want = rewrite(readFileSync(join(root, src), 'utf8'))
  const out = join(refs, dest)
  const have = existsSync(out) ? readFileSync(out, 'utf8') : null
  if (have === want) continue
  if (check) {
    console.error(`stale: ${dest} (from ${src})`)
    stale++
  } else {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, want)
    console.log(`wrote ${dest}`)
  }
}
if (stale) {
  console.error('Skill references are out of date: run `npm run sync:skill`.')
  process.exit(1)
}
