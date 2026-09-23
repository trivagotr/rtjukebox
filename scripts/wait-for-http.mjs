const [url] = process.argv.slice(2);

if (!url) {
  console.error('Usage: node wait-for-http.mjs <url>');
  process.exit(2);
}

const deadline = Date.now() + 90_000;

while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    if (response.ok) {
      console.log(`Ready: ${url} (${response.status})`);
      process.exit(0);
    }
  } catch {
    // The backend is still booting; retry until the deadline.
  }

  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

console.error(`Timed out waiting for ${url}`);
process.exit(1);
