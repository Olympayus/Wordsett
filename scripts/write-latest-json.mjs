// 发布时生成 latest.json（updater endpoint 读取）。
// 按产物存在性生成平台条目：Windows NSIS + macOS dmg。某平台无 .sig 则跳过。
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const repo = 'Olympayus/Wordsett'
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
const version = pkg.version
const releaseUrl = (asset) => `https://github.com/${repo}/releases/download/v${version}/${asset}`

const platforms = {}

function addPlatform(key, asset) {
  const sigPath = `${asset}.sig`
  for (const dir of ['nsis', 'dmg', 'macos']) {
    const p = join('src-tauri/target/release/bundle', dir, sigPath)
    if (existsSync(p)) {
      platforms[key] = { signature: readFileSync(p, 'utf8').trim(), url: releaseUrl(asset) }
      return
    }
  }
  console.warn(`skip ${key}: no .sig for ${asset}`)
}

addPlatform('windows-x86_64', `Wordsett_${version}_x64-setup.exe`)
addPlatform('darwin-aarch64', `Wordsett_${version}_aarch64.dmg`)
addPlatform('darwin-x86_64', `Wordsett_${version}_x64.dmg`)

if (Object.keys(platforms).length === 0) {
  console.error('No updater .sig artifacts found — build with createUpdaterArtifacts first.')
  process.exit(1)
}

// notes 的来源：优先 `docs/releases/v<version>.md`（面向用户的更新说明，仓库里每版一份），
// 没有这个文件时**沿用上一次 latest.json 里的 notes**——`docs/` 不入 git，macOS 那台机器上
// 可能没有该文件，重新生成 latest.json 时不能把 Windows 那轮写好的 notes 抹成空串。
const notesFile = `docs/releases/v${version}.md`
const prevNotes = existsSync('./latest.json')
  ? (JSON.parse(readFileSync('./latest.json', 'utf8')).notes ?? '')
  : ''
const notes = existsSync(notesFile) ? readFileSync(notesFile, 'utf8').trim() : prevNotes
console.log(
  existsSync(notesFile) ? `notes: from ${notesFile}`
  : prevNotes ? 'notes: kept from existing latest.json'
  : 'notes: EMPTY — 写一份 docs/releases/v<version>.md 或手工填写',
)

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
}

writeFileSync('./latest.json', JSON.stringify(latest, null, 2) + '\n')
console.log(`written latest.json for v${version}: ${Object.keys(platforms).join(', ')}`)
