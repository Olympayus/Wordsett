import { cpSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { platform, homedir } from 'os'

const BUNBLE_ID = 'com.wordsett.app'

function getAppDataDir() {
  if (platform() === 'win32') {
    return join(process.env.APPDATA, BUNBLE_ID)
  }
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', BUNBLE_ID)
  }
  return join(homedir(), '.local', 'share', BUNBLE_ID)
}

const srcDir = join(import.meta.dirname, '..', 'public', 'dictionaries')
const destDir = getAppDataDir()

if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

for (const name of ['ecdict.db', 'wordnet.db']) {
  cpSync(join(srcDir, name), join(destDir, name), { force: true })
  console.log(`  → copied ${name} to ${destDir}`)
}
