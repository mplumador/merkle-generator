import { expect } from 'chai';
import { ethers } from 'ethers';
import { calculateUserBalanceSeconds, getBlockTimestamp } from '../src/utils.mjs';

const GENESIS_BLOCK = 13720539;
const RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';

describe('utils', async () => {
  let provider;
  let epoch;

  before(async () => {
    provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    epoch = {
      startBlock: GENESIS_BLOCK,
      endBlock: GENESIS_BLOCK + 1000,
    };
  });

  describe('calculateUserBalanceSeconds', () => {
    it('calculates correctly when user has balance from start', async () => {
      const user = '0x123';
      const balance = ethers.BigNumber.from('100');
      const results = await calculateUserBalanceSeconds(
        epoch,
        provider,
        user,
        balance,
        balance,
        {},
      );
      const elapsed =
        (await getBlockTimestamp(epoch.endBlock, provider)) -
        (await getBlockTimestamp(epoch.startBlock, provider));
      const expected = balance.mul(elapsed);
      expect(expected.toString()).to.eq(results.userBalanceSeconds.toString());
      expect('0').to.eq(results.forfeitBalanceSeconds.toString());
    });

    it('calculates correctly when user has balance from start and exits', async () => {
      const user = '0x123';
      const balance = ethers.BigNumber.from('100');
      const balanceAtEnd = ethers.BigNumber.from('0');
      const exitEvent = {
        event: 'TokensWithdrawn',
        user,
        poolId: 0,
        amount: balance,
      };
      const exitBlock = GENESIS_BLOCK + 500;
      const userEvents = {};
      userEvents[exitBlock] = exitEvent;

      const results = await calculateUserBalanceSeconds(
        epoch,
        provider,
        user,
        balance,
        balanceAtEnd,
        userEvents,
      );
      const elapsed =
        (await getBlockTimestamp(exitBlock, provider)) -
        (await getBlockTimestamp(epoch.startBlock, provider));
      const expected = balance.mul(elapsed);
      expect('0').to.eq(results.userBalanceSeconds.toString());
      expect(expected.toString()).to.eq(results.forfeitBalanceSeconds.toString());
    });

    it('calculates correctly when user no balance from start and enters', async () => {
      const user = '0x123';
      const balance = ethers.BigNumber.from('0');
      const balanceAtEnd = ethers.BigNumber.from('100');
      const enterEvent = {
        event: 'TokensDeposited',
        user,
        poolId: 0,
        amount: balanceAtEnd,
      };
      const enterBlock = GENESIS_BLOCK + 300;
      const userEvents = {};
      userEvents[enterBlock] = enterEvent;

      const results = await calculateUserBalanceSeconds(
        epoch,
        provider,
        user,
        balance,
        balanceAtEnd,
        userEvents,
      );
      const elapsed =
        (await getBlockTimestamp(epoch.endBlock, provider)) -
        (await getBlockTimestamp(enterBlock, provider));
      const expected = balanceAtEnd.mul(elapsed);
      expect(expected.toString()).to.eq(results.userBalanceSeconds.toString());
      expect('0').to.eq(results.forfeitBalanceSeconds.toString());
    });

    it('calculates correctly when user has balance from start and enters for more', async () => {
      const user = '0x123';
      const balance = ethers.BigNumber.from('100');
      const balanceAtEnd = ethers.BigNumber.from('200');
      const enterEvent = {
        event: 'TokensDeposited',
        user,
        poolId: 0,
        amount: balanceAtEnd.sub(balance),
      };
      const enterBlock = GENESIS_BLOCK + 300;
      const userEvents = {};
      userEvents[enterBlock] = enterEvent;

      const results = await calculateUserBalanceSeconds(
        epoch,
        provider,
        user,
        balance,
        balanceAtEnd,
        userEvents,
      );
      const elapsedFirstBalance =
        (await getBlockTimestamp(epoch.endBlock, provider)) -
        (await getBlockTimestamp(epoch.startBlock, provider));
      const expectedFirstBalance = balance.mul(elapsedFirstBalance);

      const elapsedSecondBalance =
        (await getBlockTimestamp(epoch.endBlock, provider)) -
        (await getBlockTimestamp(enterBlock, provider));
      const expectedSecondsBalance = balanceAtEnd.sub(balance).mul(elapsedSecondBalance);

      expect(expectedFirstBalance.add(expectedSecondsBalance).toString()).to.eq(
        results.userBalanceSeconds.toString(),
      );
      expect('0').to.eq(results.forfeitBalanceSeconds.toString());
    });

    it('calculates correctly when user has balance from start, exits and re-enters', async () => {
      const user = '0x123';
      const balance = ethers.BigNumber.from('100');
      const balanceAtEnd = ethers.BigNumber.from('100');
      const enterEvent = {
        event: 'TokensDeposited',
        user,
        poolId: 0,
        amount: balanceAtEnd,
      };
      const exitEvent = {
        event: 'TokensWithdrawn',
        user,
        poolId: 0,
        amount: balance,
      };
      const exitBlock = GENESIS_BLOCK + 200
      const enterBlock = GENESIS_BLOCK + 400;
      const userEvents = {};
      userEvents[enterBlock] = enterEvent;
      userEvents[exitBlock] = exitEvent;

      const results = await calculateUserBalanceSeconds(
        epoch,
        provider,
        user,
        balance,
        balanceAtEnd,
        userEvents,
      );
      
      const elapsedFirstBalance =
        (await getBlockTimestamp(exitBlock, provider)) -
        (await getBlockTimestamp(epoch.startBlock, provider));
      const expectedFirstBalance = balance.mul(elapsedFirstBalance);

      const elapsedSecondBalance =
        (await getBlockTimestamp(epoch.endBlock, provider)) -
        (await getBlockTimestamp(enterBlock, provider));
      const expectedSecondsBalance = balanceAtEnd.mul(elapsedSecondBalance);

      expect(expectedSecondsBalance.toString()).to.eq(
        results.userBalanceSeconds.toString(),
      );
      expect(expectedFirstBalance.toString()).to.eq(results.forfeitBalanceSeconds.toString());

    });
  });
});
