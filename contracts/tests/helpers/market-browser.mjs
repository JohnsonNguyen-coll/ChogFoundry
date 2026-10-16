import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Optional browser verification against a live test-owned indexer and actual fork events.
// No route interception, fabricated responses, wallet provider or runtime fallback.
export async function marketBrowser(apiBase, token, wallet, { preflight = false, launch = false, launchReceiptHash = null } = {}) {
  if (!process.env.PLAYWRIGHT_RUNTIME) return null;
  const trace=stage=>{if(process.env.MARKET_BROWSER_TRACE)console.log(`[market-browser] ${stage}`);};
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_RUNTIME);
  const frontendRequire = createRequire(new URL('../../../frontend/package.json', import.meta.url));
  const { createServer } = await import(pathToFileURL(frontendRequire.resolve('vite')).href);
  const vite = await createServer({
    root: fileURLToPath(new URL('../../../frontend', import.meta.url)),
    configFile: fileURLToPath(new URL('../../../frontend/vite.config.mjs', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, strictPort: false, proxy: { '/api': { target: apiBase } } },
  });
  let browser;
  try {
    await vite.listen();
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    trace('opening live test frontend');
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}`, { waitUntil: 'networkidle' });
    await page.getByRole('button',{name:/connect wallet/i}).first().click();
    const walletDialog=page.getByRole('dialog');await walletDialog.waitFor();
    assert.ok(await walletDialog.getByText('Connect a Wallet',{exact:true}).count()>0);
    if(await page.getByText('Mobile WalletConnect requires a Project ID. Browser wallets are available.',{exact:true}).count())assert.equal(await walletDialog.getByRole('button',{name:/walletconnect/i}).count(),0,'No invented WalletConnect project ID');
    await walletDialog.getByRole('button',{name:'Close',exact:true}).click();
    await walletDialog.waitFor({state:'hidden'});
    await page.locator('#market-token').fill(token);
    await page.getByRole('button', { name: 'Open market' }).click();
    trace('waiting for canonical stream');
    await page.getByText('stream connected', { exact: false }).waitFor();
    await page.getByLabel('Public wallet address',{exact:true}).fill(wallet);
    await page.getByRole('button',{name:'Inspect portfolio',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#portfolio')?.dataset.portfolioCursor);
    assert.ok(await page.locator(`[data-portfolio-token="${token}"]`).count()>0);
    await page.locator(`[data-portfolio-token="${token}"]`).getByRole('button',{name:'View market',exact:true}).click();
    assert.equal(await page.locator('#market-token').inputValue(),token);
    await page.getByRole('textbox',{name:'Wallet address to inspect'}).fill(wallet);
    await page.getByRole('button',{name:'Inspect wallet'}).click();
    trace('waiting for actual wallet state');
    await page.getByText('Creator fee credits',{exact:true}).waitFor();
    await page.getByText('Indexed token balance',{exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Trade amount'}).fill('0.01');
    await page.getByRole('button',{name:'Preview quote'}).click();
    trace('waiting for actual quote');
    await page.getByText('Unused maximum budget',{exact:true}).waitFor();
    assert.equal(await page.locator('.quote-review').count(),1);
    if(preflight){
      await page.getByRole('textbox',{name:'Slippage tolerance'}).fill('1');
      await page.getByRole('textbox',{name:'Deadline minutes'}).fill('10');
      await page.getByRole('button',{name:'Inspect settlement',exact:true}).click();
      await page.getByText('Settlement status',{exact:true}).waitFor();
      assert.equal(await page.locator('.quote-review').count(),2);
      assert.ok(await page.getByText('Unsigned inspection only.',{exact:false}).isVisible());
      await page.getByRole('textbox',{name:'Slippage tolerance'}).fill('0.5');
      assert.equal(await page.getByText('Settlement status',{exact:true}).count(),0,'Changed protection discards stale simulation');
      await page.getByRole('button',{name:'Inspect settlement',exact:true}).click();
      await page.getByText('Settlement status',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Inspect approval plan',exact:true}).click();
      await page.getByText('Approval status',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Inspect fee claim',exact:true}).click();
      await page.getByText('Claim status',{exact:true}).waitFor();
      assert.equal(await page.getByText(wallet,{exact:true}).count()>0,true);
    }
    if(launch){
      await page.getByRole('textbox',{name:'Launch NFT token ID',exact:true}).fill('1557');
      await page.getByRole('textbox',{name:'Launch creator wallet',exact:true}).fill(wallet);
      await page.getByRole('textbox',{name:'Launch token name',exact:true}).fill('Actual launch review');
      await page.getByRole('textbox',{name:'Launch token symbol',exact:true}).fill('REVIEW');
      await page.getByRole('textbox',{name:'Launch deadline minutes',exact:true}).fill('10');
      await page.getByRole('button',{name:'Inspect launch',exact:true}).click();
      await page.getByText('Launch status',{exact:true}).waitFor();
      assert.equal(await page.locator('.launch-review').count(),1);
      await page.getByRole('textbox',{name:'Launch token symbol',exact:true}).fill('NEXT');
      assert.equal(await page.locator('.launch-review').count(),0,'Metadata changes discard launch inspection');
      await page.getByRole('button',{name:'Inspect launch',exact:true}).click();
      await page.getByText('Launch status',{exact:true}).waitFor();
    }
    if(launchReceiptHash){
      await page.getByLabel('Launch transaction hash',{exact:true}).fill(launchReceiptHash);
      await page.getByRole('button',{name:'Verify launch receipt',exact:true}).click();
      await page.getByText('verified-launch',{exact:true}).waitFor();
      assert.equal(await page.locator('.receipt-review').count(),1);
    }
    return {
      async check(snapshot, label) {
        trace(`checking ${label} snapshot and layout`);
        await page.waitForFunction(cursor=>document.querySelector('.wallet-activity')?.dataset.walletCursor===cursor,snapshot.cursor);
        await page.waitForFunction(hash => document.querySelector('.market-card')?.dataset.blockHash === hash, snapshot.snapshot.blockHash);
        assert.equal(await page.locator('.market-tables').first().locator('tbody').first().locator('tr').count(), snapshot.trades.length);
        const official=snapshot.trades.filter(t=>t.attribution?.method==='foundry-lock-pool-trade').length;
        assert.equal(await page.getByText('Official settlement payer',{exact:true}).count(),official);
        assert.equal(await page.getByText('Callback router; payer unknown',{exact:true}).count(),snapshot.trades.filter(t=>!t.payer).length);
        assert.equal(await page.locator('.market-tables').first().locator('tbody').nth(1).locator('tr').count(), snapshot.holders.top.length);
        assert.equal(await page.locator('.candle-chart g').count(), Math.min(120, snapshot.candles.length));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.locator('#markets').screenshot({ path: fileURLToPath(new URL(`../../artifacts/market-ui-${label}-desktop.png`, import.meta.url)) });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.locator('#markets').screenshot({ path: fileURLToPath(new URL(`../../artifacts/market-ui-${label}-mobile.png`, import.meta.url)) });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.getByRole('button',{name:'Refresh portfolio',exact:true}).click();
        await page.waitForFunction(cursor=>document.querySelector('#portfolio')?.dataset.portfolioCursor===cursor,snapshot.cursor);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        assert.deepEqual(errors, []);trace(`checked ${label}`);
      },
      async reset(snapshot, orphanHash) {
        await this.check(snapshot, 'reorg');
        assert.equal(await page.locator(`tr[data-transaction="${orphanHash}"]`).count(), 0);
        assert.equal(await page.locator(`tr[data-wallet-transaction="${orphanHash}"]`).count(),0);
        trace('waiting for reorg notice');
        await page.getByText('Chain reorganization:', { exact: false }).waitFor();
      },
      async close() { await browser.close(); await vite.close(); },
    };
  } catch (error) { await browser?.close(); await vite.close(); throw error; }
}
