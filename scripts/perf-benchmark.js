
/* eslint-disable no-undef */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const FILES_COUNT = 10;
const SAMPLE_FILE = 'public/sample.dng'; // Content doesn't matter for mock
const TARGET_DIR = 'public/bench_temp';

async function main() {
  console.log('Starting Benchmark (Mock Mode)...');

  if (fs.existsSync(TARGET_DIR)) {
      fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  const filePaths = [];
  for (let i = 0; i < FILES_COUNT; i++) {
    // Name must trigger the mock in useGallery.js
    const p = path.join(TARGET_DIR, `bench_mock_${i}.dng`);
    // Create dummy file content if sample doesn't exist or is huge
    if (fs.existsSync(SAMPLE_FILE)) {
        fs.copyFileSync(SAMPLE_FILE, p);
    } else {
        fs.writeFileSync(p, 'dummy content');
    }
    filePaths.push(p);
  }

  const vite = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'ignore'
  });

  await new Promise(r => setTimeout(r, 5000));

  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));

  try {
    await page.goto('http://localhost:5173');
    await page.waitForSelector('#raw-upload-input', { state: 'attached' });

    console.log('Uploading files...');
    const start = Date.now();

    const fileInput = await page.$('#raw-upload-input');
    await fileInput.setInputFiles(filePaths);

    console.log('Waiting for completion...');
    await page.waitForFunction((count) => {
        // Mock returns data, so thumbnails should appear (empty/black but present)
        // Or if blob is invalid image, browser might show broken image icon
        // But "img[src^='blob:']" checks for existence of img tag with blob src
        const images = document.querySelectorAll('img[src^="blob:"]');
        return images.length >= count;
    }, FILES_COUNT, { timeout: 60000 });

    const end = Date.now();
    const duration = (end - start) / 1000;

    console.log(`\n--------------------------------------------------`);
    console.log(`BENCHMARK RESULT: ${duration.toFixed(2)}s for ${FILES_COUNT} files`);
    console.log(`--------------------------------------------------\n`);

  } catch (err) {
    console.error('Benchmark Failed:', err);
  } finally {
    await browser.close();
    vite.kill();
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
    process.exit(0);
  }
}

main();
