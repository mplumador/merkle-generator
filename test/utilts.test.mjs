import { expect } from 'chai';
import { ethers } from 'ethers';
import { getClosestBlockNumberToTimestamp } from '../src/utils.mjs';

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
});
