/**
 * Regenerates the Playwright visual baselines inside the official Playwright Docker image, so fonts
 * and anti-aliasing match CI exactly. Run with `pnpm test:visual:update`; extra arguments are passed
 * to `playwright test` (for example `pnpm test:visual:update -g "design"`).
 *
 * How it works:
 * - The image tag matches the installed @playwright/test version (mcr.microsoft.com/playwright:v<x>-noble).
 * - The repo is bind-mounted at /work. /work/node_modules is a named Docker volume, so the host's
 *   (Windows or macOS) node_modules is never used inside Linux and the host copy is never touched.
 * - The image ships an older Node, and `engines` plus `engineStrict` require the version in .nvmrc,
 *   so the official Node tarball for that version is downloaded once, checked against nodejs.org's
 *   SHASUMS256.txt, and cached in a second named volume together with corepack, pnpm and the store.
 * - Install runs with --ignore-scripts so the container never rewrites the host's git hooks.
 *
 * The first run pulls the image (about 2 GB) and downloads Node (about 50 MB).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
/** Keep in step with the corepack version in docs/DECISIONS.md and .github/actions/setup. */
const COREPACK_VERSION = '0.36.0'
const NODE_MODULES_VOLUME = 'ua-crm-visual-node-modules'
const CACHE_VOLUME = 'ua-crm-visual-cache'

function fail(message: string): never {
  console.error(`\nvisual-update: ${message}\n`)
  process.exit(1)
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function playwrightVersion(): string {
  const manifest = join(repoRoot, 'node_modules', '@playwright', 'test', 'package.json')
  if (!existsSync(manifest)) fail('@playwright/test is not installed. Run `pnpm install` first.')
  const version = readJson(manifest).version
  if (typeof version !== 'string') fail(`Could not read the version from ${manifest}.`)
  return version
}

function nodeVersion(): string {
  const version = readFileSync(join(repoRoot, '.nvmrc'), 'utf8').trim().replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+$/.test(version))
    fail(`.nvmrc must hold an exact version, found "${version}".`)
  return version
}

function docker(args: string[], inherit = false): { status: number | null; stdout: string } {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      fail('Docker was not found. Install Docker Desktop (or Docker Engine) and try again.')
    }
    fail(`Could not run docker: ${result.error.message}`)
  }
  return { status: result.status, stdout: result.stdout ?? '' }
}

function ensureDockerRunning(): void {
  const { status } = docker(['version', '--format', '{{.Server.Version}}'])
  if (status !== 0) {
    fail('Docker is installed but the engine is not running. Start Docker Desktop and try again.')
  }
}

function ensureImage(image: string): void {
  if (docker(['image', 'inspect', image]).status === 0) return
  console.log(`Pulling ${image} (about 2 GB, first run only)...`)
  if (docker(['pull', image], true).status !== 0) {
    fail(`Could not pull ${image}. Check the network connection and that the tag exists.`)
  }
}

/** Runs inside the container. "$@" carries the extra playwright arguments. */
const containerScript = String.raw`
set -euo pipefail

case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

node_dir="/cache/node-v$NODE_VERSION-linux-$arch"
if [ ! -x "$node_dir/bin/node" ]; then
  echo "Installing Node $NODE_VERSION ($arch) into the cache volume..."
  tarball="node-v$NODE_VERSION-linux-$arch.tar.gz"
  base="https://nodejs.org/dist/v$NODE_VERSION"
  tmp="$(mktemp -d)"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$tmp/$tarball" "$base/$tarball"
    curl -fsSL -o "$tmp/SHASUMS256.txt" "$base/SHASUMS256.txt"
  else
    wget -q -O "$tmp/$tarball" "$base/$tarball"
    wget -q -O "$tmp/SHASUMS256.txt" "$base/SHASUMS256.txt"
  fi
  (cd "$tmp" && grep " $tarball\$" SHASUMS256.txt | sha256sum -c -)
  tar -xzf "$tmp/$tarball" -C /cache
  rm -rf "$tmp"
fi
export PATH="$node_dir/bin:$PATH"
export COREPACK_HOME=/cache/corepack
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

if [ "$(corepack --version 2>/dev/null || true)" != "$COREPACK_VERSION" ]; then
  npm install --global --no-fund --no-audit "corepack@$COREPACK_VERSION"
fi
corepack enable

echo "Node $(node --version), pnpm $(pnpm --version), Playwright $PLAYWRIGHT_VERSION"
pnpm install --frozen-lockfile --ignore-scripts --store-dir /cache/pnpm-store

status=0
pnpm exec playwright test --project=desktop --project=narrow tests/visual --update-snapshots "$@" || status=$?

# On Linux and macOS hosts, hand the written files back to the host user.
if [ -n "$HOST_UID" ]; then
  chown -R "$HOST_UID:$HOST_GID" tests/visual test-results playwright-report dist-e2e 2>/dev/null || true
fi
exit "$status"
`.replace(/\r\n/g, '\n')

function main(): void {
  const pwVersion = playwrightVersion()
  const node = nodeVersion()
  const image = `mcr.microsoft.com/playwright:v${pwVersion}-noble`

  ensureDockerRunning()
  ensureImage(image)

  const env = [
    `NODE_VERSION=${node}`,
    `PLAYWRIGHT_VERSION=${pwVersion}`,
    `COREPACK_VERSION=${COREPACK_VERSION}`,
    'CI=1',
  ]
  // Empty on Windows, where Docker Desktop maps file ownership itself.
  env.push(`HOST_UID=${process.getuid?.() ?? ''}`, `HOST_GID=${process.getgid?.() ?? ''}`)

  const args = [
    'run',
    '--rm',
    '--init',
    '--ipc=host',
    ...(process.stdout.isTTY ? ['-t'] : []),
    '--mount',
    `type=bind,source=${repoRoot},target=/work`,
    '--mount',
    `type=volume,source=${NODE_MODULES_VOLUME},target=/work/node_modules`,
    '--mount',
    `type=volume,source=${CACHE_VOLUME},target=/cache`,
    '--workdir',
    '/work',
    ...env.flatMap((pair) => ['--env', pair]),
    image,
    'bash',
    '-c',
    containerScript,
    'visual-update',
    ...process.argv.slice(2),
  ]

  console.log(`Updating visual baselines in ${image}...`)
  const { status } = docker(args, true)
  if (status !== 0) fail(`Playwright exited with code ${status}. See the output above.`)
  console.log('Baselines updated in tests/visual/__screenshots__. Review the diff, then commit.')
}

main()
