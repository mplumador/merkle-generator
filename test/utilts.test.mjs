import { expect } from 'chai';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { getAllocationData, getMerkleData } from '../src/utils.mjs';
import config from './sample-data/config.json' assert { type: 'json' };

// const GENESIS_BLOCK = 13720539;
// const RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';
const EPSILON = 0.00000001;

describe('utils', async () => {
  // let provider;
  let sampleChainData;
  let sampleAllocationData;

  before(async () => {
    // provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    // epoch = {
    //   startBlock: GENESIS_BLOCK,
    //   endBlock: GENESIS_BLOCK + 1000,
    // };

    sampleChainData = JSON.parse(readFileSync(`./test/sample-data/${config.epoch}_chainData.json`));
    sampleAllocationData = JSON.parse(
      readFileSync(`./test/sample-data/${config.epoch}_allocationData.json`),
    );
  });

  describe('getAllocationData', () => {
    it('calculates expected allocations correctly across pools', () => {
      const allocationData = getAllocationData(sampleChainData, config);
      // we will check chain id #1 and make sure all pools are correct.
      const { pools } = allocationData.chains[1];
      let summedPercentOfChain = 0;
      let summedPercentOfTotal = 0;
      for (let i = 0; i < Object.keys(pools).length; i += 1) {
        summedPercentOfChain += pools[i].poolPercentOfChain;
        summedPercentOfTotal += pools[i].poolPercentOfTotal;
      }

      expect(summedPercentOfChain).to.be.closeTo(1, EPSILON);
      expect(summedPercentOfTotal).to.be.closeTo(
        allocationData.chains[1].chainPercentOfTotal,
        EPSILON,
      );
    });

    it('calculates expected allocations correctly across chains', async () => {
      const allocationData = getAllocationData(sampleChainData, config);
      // we will check chain id #1 and make sure all pools are correct.
      let summedPercentOfChains = 0;
      const chainIds = Object.keys(allocationData.chains);
      for (let i = 0; i < chainIds.length; i += 1) {
        summedPercentOfChains += allocationData.chains[chainIds[i]].chainPercentOfTotal;
      }
      expect(summedPercentOfChains).to.be.closeTo(1, EPSILON);
    });
  });

  describe('getMerkleData', () => {
    it('total of claims matches total to distribute', () => {
      const merkleTree = getMerkleData(sampleChainData, sampleAllocationData, config);
      const { pools } = merkleTree.chains[1];
      let totalTicFromClaims = ethers.constants.Zero;
      let totalLpTokenFromClaims = ethers.constants.Zero;
      for (let i = 0; i < Object.keys(pools).length; i += 1) {
        const { claims } = pools[i];
        const addresses = Object.keys(claims);
        addresses.forEach((address) => {
          const claim = claims[address];
          totalTicFromClaims = totalTicFromClaims.add(claim.totalTICAmount);
          totalLpTokenFromClaims = totalLpTokenFromClaims.add(claim.totalLPTokenAmount);
        });
      }

      expect(totalTicFromClaims.toNumber()).to.be.closeTo(
        parseInt(merkleTree.chains[1].ticConsumed),
        5,
      );
      expect(totalLpTokenFromClaims.toNumber()).to.be.closeTo(
        parseInt(merkleTree.chains[1].lpTokensGenerated),
        5,
      );
    });
  });
});
