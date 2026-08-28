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

const latest = {
  version,
  notes: '', // 发布时手工填写本次更新说明
  pub_date: new Date().toISOString(),
  platforms,
}

writeFileSync('./latest.json', JSON.stringify(latest, null, 2) + '\n')
console.log(`written latest.json for v${version}: ${Object.keys(platforms).join(', ')}`)
