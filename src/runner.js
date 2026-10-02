import Docker from 'dockerode';
import config from './config.js';

// Defaults to /var/run/docker.sock (Linux/macOS) or the named pipe (Windows)
const docker = new Docker();

// Download the image if this machine doesn't have it yet
async function ensureImage(name) {
  try {
    await docker.getImage(name).inspect();
  } catch {
    console.log(`Pulling ${name} ...`);
    await new Promise((resolve, reject) => {
      docker.pull(name, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (e) => (e ? reject(e) : resolve()));
      });
    });
  }
}

// Docker logs arrive as frames: 8-byte header + payload.
// header byte 0: 1 = stdout, 2 = stderr; bytes 4-7: payload size
function demux(buffer) {
  let stdout = '';
  let stderr = '';
  let i = 0;
  while (i + 8 <= buffer.length) {
    const type = buffer[i];
    const size = buffer.readUInt32BE(i + 4);
    const text = buffer.subarray(i + 8, i + 8 + size).toString('utf8');
    if (type === 2) stderr += text;
    else stdout += text;
    i += 8 + size;
  }
  return { stdout, stderr };
}

const clip = (s) =>
  s.length > config.limits.maxOutputChars
    ? s.slice(0, config.limits.maxOutputChars) + '\n...[output truncated]'
    : s;

export async function runCode(language, code) {
  const lang = config.languages[language];
  const { limits } = config;
  await ensureImage(lang.image);

  const container = await docker.createContainer({
    Image: lang.image,
    Cmd: lang.cmd(code),
    User: '65534:65534', // "nobody": not root inside the container
    NetworkDisabled: true, // no internet; cannot reach AWS credentials either
    HostConfig: {
      NetworkMode: 'none',
      Memory: limits.memoryBytes,
      MemorySwap: limits.memoryBytes, // same as Memory = no swap
      NanoCpus: limits.cpus * 1e9,
      PidsLimit: limits.maxProcesses,
      ReadonlyRootfs: true, // cannot write to the filesystem
      CapDrop: ['ALL'], // drop all Linux capabilities
      SecurityOpt: ['no-new-privileges'],
      // tiny log file so an infinite print loop cannot fill the disk
      LogConfig: { Type: 'json-file', Config: { 'max-size': '64k', 'max-file': '1' } },
    },
  });

  const started = Date.now();
  let timedOut = false;
  try {
    await container.start();

    // Watchdog: kill the container if it runs too long
    const timer = setTimeout(async () => {
      timedOut = true;
      await container.kill().catch(() => {});
    }, limits.timeoutMs);

    const { StatusCode } = await container.wait(); // resolves when the container exits
    clearTimeout(timer);

    const logs = await container.logs({ stdout: true, stderr: true });
    const { stdout, stderr } = demux(logs);
    return {
      stdout: clip(stdout),
      stderr: clip(stderr),
      exitCode: StatusCode,
      timedOut,
      durationMs: Date.now() - started,
    };
  } finally {
    // ALWAYS delete the container, even on errors
    await container.remove({ force: true }).catch(() => {});
  }
}