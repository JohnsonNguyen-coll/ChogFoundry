import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Contract, MaxUint256, ZeroAddress, keccak256, parseEther, toBeHex } from 'ethers';
import { chain } from '../../backend/src/config.mjs';
import { candidates } from '../../backend/scripts/market-inspection.mjs';
import { withMonadFork } from './helpers/monad-fork.mjs';

test('actual CHOG fork compatibility: exact balances, allowance, events and failed transfers', { timeout: 180000 }, async () => {
  await withMonadFork(async ({ local, upstream, block }) => {
    const abi = [
      'function totalSupply() view returns(uint256)', 'function balanceOf(address) view returns(uint256)',
      'function allowance(address,address) view returns(uint256)', 'function approve(address,uint256) returns(bool)',
      'function transfer(address,uint256) returns(bool)', 'function transferFrom(address,address,uint256) returns(bool)',
      'event Transfer(address indexed from,address indexed to,uint256 value)',
      'event Approval(address indexed owner,address indexed spender,uint256 value)'
    ];
    const quote = new Contract(chain.quote, abi, local);
    const initialSupply = await quote.totalSupply();
    assert.equal(initialSupply, await new Contract(chain.quote, abi, upstream).totalSupply({ blockTag: block.number }));
    const code = await upstream.getCode(chain.quote, block.number);
    const target = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i.exec(code)?.[1];
    assert.ok(target);
    const implementation = '0x' + target;
    const implementationCode = await upstream.getCode(implementation, block.number);
    assert.equal(await local.getCode(chain.quote), code);
    assert.equal(await local.getCode(implementation), implementationCode);
    const accounts = await local.send('eth_accounts', []);
    const [sender, spender, recipient] = await Promise.all(accounts.slice(0, 3).map(a => local.getSigner(a)));
    const senderAddress = await sender.getAddress(), spenderAddress = await spender.getAddress(), recipientAddress = await recipient.getAddress();
    const factory = new Contract(candidates.v3Factory, ['function getPool(address,address,uint24) view returns(address)'], local);
    const holder = await factory.getPool(chain.quote, candidates.wrappedMon, 3000);
    assert.notEqual(holder, ZeroAddress);
    const funding = parseEther('5');
    assert.ok(await quote.balanceOf(holder) >= funding, 'Real source holder must have enough CHOG; no token balance overrides.');
    await local.send('anvil_impersonateAccount', [holder]);
    await local.send('anvil_setBalance', [holder, toBeHex(parseEther('10'))]);
    const holderSigner = await local.getSigner(holder);

    function events(receipt, name) {
      return receipt.logs.filter(log => log.address.toLowerCase() === chain.quote.toLowerCase()).map(log => {
        try { return quote.interface.parseLog(log); } catch { return null; }
      }).filter(log => log?.name === name);
    }
    async function transferChecked(signer, to, amount) {
      const from = await signer.getAddress();
      const beforeFrom = await quote.balanceOf(from), beforeTo = await quote.balanceOf(to);
      assert.equal(await quote.connect(signer).transfer.staticCall(to, amount), true);
      const receipt = await (await quote.connect(signer).transfer(to, amount)).wait();
      assert.equal(await quote.balanceOf(from), beforeFrom - amount);
      assert.equal(await quote.balanceOf(to), beforeTo + amount);
      const transfers = events(receipt, 'Transfer');
      assert.ok(transfers.some(e => e.args.from === from && e.args.to === to && e.args.value === amount));
      assert.equal(await quote.totalSupply(), initialSupply);
    }
    await transferChecked(holderSigner, senderAddress, funding);
    // Test scales, not configured trade sizes or token economics.
    for (const amount of [0n, 1n, 10n ** 12n, parseEther('1')]) {
      await transferChecked(sender, recipientAddress, amount);
    }
    const approved = parseEther('1');
    const approvalReceipt = await (await quote.connect(sender).approve(spenderAddress, approved)).wait();
    assert.equal(await quote.allowance(senderAddress, spenderAddress), approved);
    assert.ok(events(approvalReceipt, 'Approval').some(e => e.args.owner === senderAddress && e.args.spender === spenderAddress && e.args.value === approved));
    const pulled = approved / 4n;
    const beforeSender = await quote.balanceOf(senderAddress), beforeRecipient = await quote.balanceOf(recipientAddress);
    assert.equal(await quote.connect(spender).transferFrom.staticCall(senderAddress, recipientAddress, pulled), true);
    const pulledReceipt = await (await quote.connect(spender).transferFrom(senderAddress, recipientAddress, pulled)).wait();
    assert.equal(await quote.balanceOf(senderAddress), beforeSender - pulled);
    assert.equal(await quote.balanceOf(recipientAddress), beforeRecipient + pulled);
    assert.equal(await quote.allowance(senderAddress, spenderAddress), approved - pulled);
    assert.ok(events(pulledReceipt, 'Transfer').some(e => e.args.value === pulled));

    await (await quote.connect(sender).approve(spenderAddress, 0n)).wait();
    assert.equal(await quote.allowance(senderAddress, spenderAddress), 0n);
    const failureState = [await quote.balanceOf(senderAddress), await quote.balanceOf(recipientAddress), await quote.totalSupply()];
    await assert.rejects(async () => {
      const tx = await quote.connect(spender).transferFrom(senderAddress, recipientAddress, 1n, { gasLimit: 300000 });
      await tx.wait();
    });
    assert.deepEqual([await quote.balanceOf(senderAddress), await quote.balanceOf(recipientAddress), await quote.totalSupply()], failureState);
    await assert.rejects(quote.connect(sender).transfer.staticCall(recipientAddress, failureState[0] + 1n));
    await assert.rejects(quote.connect(sender).transfer.staticCall(ZeroAddress, 1n));

    await (await quote.connect(sender).approve(spenderAddress, MaxUint256)).wait();
    await (await quote.connect(spender).transferFrom(senderAddress, recipientAddress, 1n)).wait();
    const maximumAllowanceAfterSpend = await quote.allowance(senderAddress, spenderAddress);
    // ERC-20 does not prescribe max-allowance decrement semantics; record the actual behavior.
    assert.ok(maximumAllowanceAfterSpend === MaxUint256 || maximumAllowanceAfterSpend === MaxUint256 - 1n);
    await (await quote.connect(sender).approve(spenderAddress, 0n)).wait();

    const tracked = [senderAddress, recipientAddress, holder];
    const beforeTime = await Promise.all(tracked.map(a => quote.balanceOf(a)));
    await local.send('evm_increaseTime', [86400]);
    await local.send('evm_mine', []);
    assert.deepEqual(await Promise.all(tracked.map(a => quote.balanceOf(a))), beforeTime);
    assert.equal(await quote.totalSupply(), initialSupply);
    assert.equal((await upstream.getBlock(block.number)).hash, block.hash);

    const report = {
      testedAt: new Date().toISOString(), mode: 'isolated-real-state-fork',
      source: { chainId: 143, blockNumber: block.number, blockHash: block.hash, rpcOrigin: new URL(chain.rpcUrl).origin },
      localChainId: 31337, quote: chain.quote, implementation, implementationCodeHash: keccak256(implementationCode),
      checks: { exactTransfers: true, zeroTransferEvent: true, transferFrom: true, finiteAllowance: true, revoke: true, failedTransferRollback: true, insufficientBalanceRejected: true, zeroRecipientRejected: true, noBalanceChangeAfterOneDayWithoutTransactions: true },
      maximumAllowanceAfterSpend: String(maximumAllowanceAfterSpend),
      sourceVerified: false, administrativeRightsReviewed: false, settlementApproved: false,
      limitations: ['Sampled accounts and fork state only.', 'Time-only balance observation does not exclude transaction-triggered rebases or administrator actions.', 'No AMM swap or future-state guarantee.', 'Holder impersonation and gas funding are local-only; no token storage override.'],
      liveWrites: false, mockContracts: false
    };
    await writeFile(new URL('../artifacts/chog-compatibility.json', import.meta.url), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ mode: report.mode, forkBlock: block.number, exactTransfers: true, transferFrom: true, sourceVerified: false, settlementApproved: false, liveWrites: false }));
  });
});
