import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDir, '..', '..')
const sourceRoot = path.join(repositoryRoot, 'study-game', 'dist')
const androidAssetsRoot = path.join(repositoryRoot, 'mobile', 'android', 'app', 'src', 'main', 'assets')
const targetRoot = path.join(androidAssetsRoot, 'study-game')

if (!targetRoot.startsWith(`${androidAssetsRoot}${path.sep}`)) throw new Error('Refusing to package outside Android assets')
if (!(await stat(path.join(sourceRoot, 'index.html')).catch(() => null))) {
  throw new Error('study-game/dist is missing. Run npm run build in study-game first.')
}

await rm(targetRoot, { recursive: true, force: true })
await mkdir(targetRoot, { recursive: true })
await cp(sourceRoot, targetRoot, { recursive: true })

async function collectFiles(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const next = path.join(relative, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(root, next))
    else files.push(next.replaceAll(path.sep, '/'))
  }
  return files.sort()
}

const files = await collectFiles(targetRoot)
const manifest = {}
for (const relative of files) {
  const bytes = await readFile(path.join(targetRoot, relative))
  manifest[relative] = createHash('sha256').update(bytes).digest('hex')
}
await writeFile(path.join(targetRoot, 'packaging-manifest.json'), `${JSON.stringify({ schemaVersion: 1, files: manifest }, null, 2)}\n`)

console.log(`Packaged ${files.length} Study files into ${targetRoot}`)
