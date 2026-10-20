const port = process.env.RW_PORT || 4173;
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
    signal: AbortSignal.timeout(2000),
  });
  const data = await response.json();
  if (data.app !== "release-workbench") throw new Error();
  console.log(
    `Running: http://127.0.0.1:${port}/ (PID ${data.pid}, ${data.status})`,
  );
} catch {
  console.log(`Release Workbench is not running on port ${port}.`);
  process.exitCode = 1;
}
