'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.SPINE_TEST_OUTPUT || path.join(root, '.launch-output'));
let browser, session;
const report = { mode: 'development-launcher', passed: false };
async function main() {
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const env = { ...process.env, SPINE_PHYSICS_TEST: '1', SPINE_PHYSICS_TEST_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  execFileSync('cmd.exe', ['/d', '/c', path.join(root, 'Start-Development.cmd'), '--remote-debugging-port=0'], { cwd: root, env, timeout: 30000, stdio: 'ignore' });
  let port;
  for (let attempt = 0; attempt < 120; attempt++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); if (port) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(port, 'development launcher did not expose its isolated app');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  session = await browser.newBrowserCDPSession();
  const page = browser.contexts()[0].pages()[0];
  await page.waitForFunction(() => window.__spineTool?.getHistoryState && window.desktop);
  report.info = await page.evaluate(() => window.desktop.getInfo());
  assert.equal(report.info.packaged, false);
  assert(page.url().includes('/src/renderer/index.html'));
  assert.equal(await page.locator('.activity-panel').count(), 1);
  report.url = page.url();
  report.checks = ['Windows CMD launcher opens source Electron app with sandbox bridge, new history API and activity panel in an isolated profile'];
  report.passed = true;
}
main().catch(error => { report.failure = error.stack; process.exitCode = 1; }).finally(async () => {
  await fs.writeFile(path.join(output, 'launch-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (session) await session.send('Browser.close').catch(() => {});
  if (browser) await browser.close().catch(() => {});
});