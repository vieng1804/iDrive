import { spawn } from 'node:child_process';

function run(cmd, args) {
  const child = spawn(cmd, args, { stdio: 'inherit', shell: true });
  child.on('exit', (code) => {
    if (code) process.exit(code);
  });
  return child;
}

const server = run('node', ['server/index.mjs']);
const vite = run('npx', ['vite', '--host', '0.0.0.0', '--port', '5180', '--strictPort']);

function shutdown() {
  server.kill();
  vite.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
