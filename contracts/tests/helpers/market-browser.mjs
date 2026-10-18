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
    assert.equal(await page.locator('.landing-hero h1').count(),1);
    assert.equal(await page.locator('#market-token').count(),0,'Landing is separate from the dapp');
    await page.screenshot({path:fileURLToPath(new URL('../../artifacts/landing-desktop.png',import.meta.url)),fullPage:true});
    await page.screenshot({path:fileURLToPath(new URL('../../artifacts/landing-hero-desktop.png',import.meta.url))});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:fileURLToPath(new URL('../../artifacts/landing-mobile.png',import.meta.url)),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('link',{name:'Launch App',exact:false}).first().click();await page.waitForURL('**/app/explore');
    await page.getByRole('navigation',{name:'Dapp navigation'}).getByRole('link',{name:'My studios',exact:false}).click();
    await page.getByRole('heading',{name:'Bring your studio NFT.',exact:true}).waitFor();
    await page.screenshot({path:fileURLToPath(new URL('../../artifacts/dapp-studios-desktop.png',import.meta.url))});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:fileURLToPath(new URL('../../artifacts/dapp-studios-mobile.png',import.meta.url))});await page.setViewportSize({width:1440,height:1000});
    assert.equal(await page.locator('#token-id').count(),0,'No NFT ID search in the main studio flow');
    await page.getByRole('navigation',{name:'Dapp navigation'}).getByRole('link',{name:'Markets',exact:false}).click();
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
    await page.reload({waitUntil:'networkidle'});await page.getByText('stream connected',{exact:false}).waitFor();assert.equal(await page.locator('#market-token').inputValue(),token,'Direct market URL survives reload');
    const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
    await page.waitForURL(`**/app/markets/${token}`);
    const communityPage=await browser.newPage({viewport:{width:1440,height:1000}});
    communityPage.on('pageerror',error=>errors.push(error.message));
    for(const route of ['clubs','agent','treasury','campaigns']){
      await communityPage.goto(base+'/app/'+route,{waitUntil:'networkidle'});
      await communityPage.getByRole('heading',{level:1}).waitFor();
      assert.equal(await communityPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' desktop overflow');
      await communityPage.screenshot({path:fileURLToPath(new URL('../../artifacts/community-'+route+'-desktop.png',import.meta.url))});
      await communityPage.setViewportSize({width:390,height:844});
      assert.equal(await communityPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' mobile overflow');
      await communityPage.screenshot({path:fileURLToPath(new URL('../../artifacts/community-'+route+'-mobile.png',import.meta.url))});
      await communityPage.setViewportSize({width:1440,height:1000});
    }
    await communityPage.close();

    const portfolioPage=await browser.newPage({viewport:{width:1440,height:1000}});portfolioPage.on('pageerror',e=>errors.push(e.message));
    await portfolioPage.goto(base+'/app/portfolio',{waitUntil:'networkidle'});
    async function inspectPortfolio(){await portfolioPage.getByLabel('Public wallet address',{exact:true}).fill(wallet);await portfolioPage.getByRole('button',{name:'Inspect portfolio',exact:true}).click();await portfolioPage.waitForFunction(()=>document.querySelector('#portfolio')?.dataset.portfolioCursor);}
    await inspectPortfolio();assert.ok(await portfolioPage.locator(`[data-portfolio-token="${token}"]`).count()>0);
    await portfolioPage.locator(`[data-portfolio-token="${token}"]`).getByRole('button',{name:'View market',exact:true}).click();await portfolioPage.waitForURL(`**/app/markets/${token}`);
    await portfolioPage.goBack();await inspectPortfolio();
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
    let launchPage;
    if(launch||launchReceiptHash){launchPage=await browser.newPage({viewport:{width:1440,height:1000}});launchPage.on('pageerror',e=>errors.push(e.message));await launchPage.goto(base+'/app/launch/inspect',{waitUntil:'networkidle'});}
    if(launch){
      await launchPage.getByRole('textbox',{name:'Launch NFT token ID',exact:true}).fill('1557');
      await launchPage.getByRole('textbox',{name:'Launch creator wallet',exact:true}).fill(wallet);
      await launchPage.getByRole('textbox',{name:'Launch token name',exact:true}).fill('Actual launch review');
      await launchPage.getByRole('textbox',{name:'Launch token symbol',exact:true}).fill('REVIEW');
      await launchPage.getByRole('textbox',{name:'Launch deadline minutes',exact:true}).fill('10');
      await launchPage.getByRole('button',{name:'Inspect launch',exact:true}).click();
      await launchPage.getByText('Launch status',{exact:true}).waitFor();
      assert.equal(await launchPage.locator('.launch-review').count(),1);
      await launchPage.getByRole('textbox',{name:'Launch token symbol',exact:true}).fill('NEXT');
      assert.equal(await launchPage.locator('.launch-review').count(),0,'Metadata changes discard launch inspection');
      await launchPage.getByRole('button',{name:'Inspect launch',exact:true}).click();
      await launchPage.getByText('Launch status',{exact:true}).waitFor();
    }
    if(launchReceiptHash){
      await launchPage.getByLabel('Launch transaction hash',{exact:true}).fill(launchReceiptHash);
      await launchPage.getByRole('button',{name:'Verify launch receipt',exact:true}).click();
      await launchPage.getByText('verified-launch',{exact:true}).waitFor();
      assert.equal(await launchPage.locator('.receipt-review').count(),1);
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
        await portfolioPage.getByRole('button',{name:'Refresh portfolio',exact:true}).click();
        await portfolioPage.waitForFunction(cursor=>document.querySelector('#portfolio')?.dataset.portfolioCursor===cursor,snapshot.cursor);
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
