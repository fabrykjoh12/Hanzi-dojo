import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const nodeCommand = process.execPath
const children = [
  spawn(npmCommand, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5176'], { stdio: 'inherit', windowsHide: false }),
  spawn(nodeCommand, ['tools/dojo-bridge.mjs'], { stdio: 'inherit', windowsHide: false }),
]

function stop() {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('exit', stop)

for (const child of children) {
  child.on('exit', code => {
    if (code && code !== 0) process.exitCode = code
  })
}
