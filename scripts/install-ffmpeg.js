// Downloads the win32-x64 ffmpeg binary from npm registry and extracts it.
// Needed because npm skips optional packages whose cpu/os fields don't match
// the current platform (this machine is win32-arm64, but Windows 11 runs x64
// binaries via its built-in x64 emulation layer).
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const destDir = path.join(__dirname, '..', 'node_modules', '@ffmpeg-installer', 'win32-x64');
const binaryPath = path.join(destDir, 'ffmpeg.exe');

if (fs.existsSync(binaryPath)) {
  console.log('ffmpeg binary already present, skipping download.');
  process.exit(0);
}

const tmpDir = path.join(__dirname, '..', 'node_modules', '.ffmpeg-tmp');
const tarPath = path.join(tmpDir, 'ffmpeg.tgz');
const url = 'https://registry.npmjs.org/@ffmpeg-installer/win32-x64/-/win32-x64-4.1.0.tgz';

fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(destDir, { recursive: true });

console.log('Downloading ffmpeg win32-x64 binary from npm registry...');
execSync(
  `powershell -Command "Invoke-WebRequest '${url}' -OutFile '${tarPath}'"`,
  { stdio: 'inherit' }
);

execSync(`tar -xzf "${tarPath}" -C "${tmpDir}"`, { stdio: 'inherit' });

const extracted = path.join(tmpDir, 'package', 'ffmpeg.exe');
fs.copyFileSync(extracted, binaryPath);
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('ffmpeg binary installed at', binaryPath);
