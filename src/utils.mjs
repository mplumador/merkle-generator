import { ethers } from 'ethers';
import BalanceTree from './BalanceTree.mjs';
import 'dotenv/config';

const BLOCK_REQUEST_LIMIT = 2048;
const ZERO = ethers.BigNumber.from('0');
const DECIMAL_PRECISION = 10000000000;

export const bigNumberJSONToString = (key, value) => {
  if (value && value.type && value.type === 'BigNumber') {
    return ethers.BigNumber.from(value.hex).toString();
  }
  return value;
};

export const getAllEvents = async (merklePools, genesisBlockNumber, currentBlockNumber, filter) => {
  let requestedBlock = genesisBlockNumber;
  const promises = [];
  while (requestedBlock < currentBlockNumber) {
    const nextRequestedBlock = requestedBlock + BLOCK_REQUEST_LIMIT;
    const eventPromise = merklePools.queryFilter(
      filter,
      requestedBlock,
      nextRequestedBlock < currentBlockNumber ? nextRequestedBlock : currentBlockNumber,
    );
    requestedBlock = nextRequestedBlock;
    promises.push(eventPromise);
  }
  const allEvents = await Promise.all(promises);
  const filteredEvents = [];
  allEvents.forEach((anEvent) => {
    if (anEvent.length > 0) {
      filteredEvents.push(...anEvent);
    }
  });
  return filteredEvents;
};

export const getAllocationData = (chainData, config) => {
  const allocations = {
    epoch: config.epoch,
    snapshotTimestamp: config.snapshotTimestamp,
    chains: {},
  };
  const totalUnclaimedTIC = ethers.BigNumber.from(chainData.totalUnclaimedTIC);
  for (let i = 0; i < config.chains.length; i += 1) {
    const chain = config.chains[i];
    const totalUnclaimedTicForChain = ethers.BigNumber.from(
      chainData.chains[chain.chainId].totalUnclaimedTIC,
    );
    const percentAllocation =
      totalUnclaimedTicForChain.mul(DECIMAL_PRECISION).div(totalUnclaimedTIC).toNumber() /
      DECIMAL_PRECISION;
    const chainAllocations = {
      pools: {},
      chainPercentOfTotal: percentAllocation,
    };

    const poolCount = Object.keys(chainData.chains[chain.chainId].pools).length;
    const { pools } = chainData.chains[chain.chainId];
    for (let ii = 0; ii < poolCount; ii += 1) {
      const totalUnclaimedForPool = ethers.BigNumber.from(pools[ii].unclaimedTic);
      chainAllocations.pools[ii] = {
        poolPercentOfTotal:
          totalUnclaimedForPool.mul(DECIMAL_PRECISION).div(totalUnclaimedTIC).toNumber() /
          DECIMAL_PRECISION,
        poolPercentOfChain:
          totalUnclaimedForPool.mul(DECIMAL_PRECISION).div(totalUnclaimedTicForChain).toNumber() /
          DECIMAL_PRECISION,
      };
    }
    allocations.chains[chain.chainId] = {
      name: chain.name,
      chainId: chain.chainId,
      ...chainAllocations,
    };
  }
  return allocations;
};

export const getAllTokensDepositedEvents = async (
  merklePools,
  genesisBlockNumber,
  currentBlockNumber,
) =>
  getAllEvents(
    merklePools,
    genesisBlockNumber,
    currentBlockNumber,
    merklePools.filters.TokensDeposited(),
  );

export const getAllTokensWithdrawnEvents = async (
  merklePools,
  genesisBlockNumber,
  currentBlockNumber,
) =>
  getAllEvents(
    merklePools,
    genesisBlockNumber,
    currentBlockNumber,
    merklePools.filters.TokensWithdrawn(),
  );

export const getChainData = async (config, tokenDeployments) => {
  const data = {
    epoch: config.epoch,
    snapshotTimestamp: config.snapshotTimestamp,
    chains: {},
  };
  let totalUnclaimedTIC = ZERO;
  let totalSummedUnclaimedTic = ZERO;

  for (let i = 0; i < config.chains.length; i += 1) {
    const chain = config.chains[i];
    const rpcURL = process.env[`RPC_URL_${chain.name.toUpperCase()}`];
    const provider = new ethers.providers.JsonRpcProvider(rpcURL);
    const chainData = await getChainUnclaimedTicData(chain, provider, tokenDeployments);

    // NOTE: this is somewhat incorrect, after the first distro we will need to take into account
    // the amount that is unclaimed in the merkle tree as well if the user hasn't claimed it!
    totalUnclaimedTIC = totalUnclaimedTIC.add(chainData.totalUnclaimedTIC);
    totalSummedUnclaimedTic = totalSummedUnclaimedTic.add(chainData.totalSummedUnclaimedTic);
    data.chains[chain.chainId] = chainData;
    // TODO: we need to handle unclaimed merkle nodes from the last distro
    // by checking their unclaimed TIC against the node and what they have claimed...
    // some users may never claim,
    // check with LSDAN if this is true, could be a good incentive for people not too claim...
    // more complicated for little benefit.  If people claim and compound its the same effect...
  }

  // save our totals
  data.totalUnclaimedTIC = totalUnclaimedTIC;
  data.totalSummedUnclaimedTic = totalSummedUnclaimedTic;
  return data;
};

export const getChainUnclaimedTicData = async (chain, provider, tokenDeployments) => {
  const merklePools = getMerklePools(chain, provider, tokenDeployments);
  const tokensDepositedEvents = await getAllTokensDepositedEvents(
    merklePools,
    chain.genesisBlock,
    chain.snapshotBlock,
  );

  console.log(`Found ${tokensDepositedEvents.length} TokensDeposited events on ${chain.name}`);

  const poolUserData = {};
  indexEventsByPoolByUser(tokensDepositedEvents, poolUserData);

  // at this point we now have all events indexed by poolId and then user address.
  // from here we need to find all of the users unclaimed TIC balances and then sum them
  // across users and then across pools
  const forfeitAddress = await merklePools.forfeitAddress();
  const poolCount = await merklePools.poolCount();

  const pools = {};
  let totalUnclaimedTIC = ethers.constants.Zero;
  let totalSummedUnclaimedTic = ethers.constants.Zero;

  for (let i = 0; i < poolCount; i += 1) {
    const pool = {
      poolId: i,
      ...(await getPoolUnclaimedTicData(
        Object.keys(poolUserData[i]),
        forfeitAddress,
        i,
        chain.snapshotBlock,
        merklePools,
      )),
    };
    pools[i] = pool;
    totalUnclaimedTIC = totalUnclaimedTIC.add(pool.unclaimedTic);
    totalSummedUnclaimedTic = totalSummedUnclaimedTic.add(pool.totalSummedUnclaimedTic);
  }

  return {
    ...chain,
    snapshotBlock: chain.snapshotBlock,
    pools,
    totalUnclaimedTIC,
    totalSummedUnclaimedTic,
  };
};

export const getMerkleClaimsForPool = (
  startingIndex,
  chainConfig,
  poolData,
  poolPercentOfChain,
) => {
  const claims = {};
  let index = startingIndex;
  const lpTokensForChain = ethers.BigNumber.from(chainConfig.lpTokensGenerated);
  const ticConsumedForChain = ethers.BigNumber.from(chainConfig.ticConsumed);
  const poolMultiplier = ethers.BigNumber.from(DECIMAL_PRECISION * poolPercentOfChain);

  const lpTokensForPool = poolMultiplier.mul(lpTokensForChain).div(DECIMAL_PRECISION);
  const ticConsumedForPool = poolMultiplier.mul(ticConsumedForChain).div(DECIMAL_PRECISION);
  const unclaimedTicForPool = ethers.BigNumber.from(poolData.unclaimedTic);

  // iterate through users of this pool to create claims
  const addresses = Object.keys(poolData.users).sort();
  addresses.forEach((address) => {
    const userPoolData = poolData.users[address];
    const userPercentOfPoolUnclaimedTic = ethers.BigNumber.from(userPoolData.totalUnclaimedTic)
      .mul(DECIMAL_PRECISION)
      .div(unclaimedTicForPool);

    const userLPTokens = lpTokensForPool.mul(userPercentOfPoolUnclaimedTic).div(DECIMAL_PRECISION);
    const userTicConsumed = ticConsumedForPool
      .mul(userPercentOfPoolUnclaimedTic)
      .div(DECIMAL_PRECISION);

    // we need to add anything they have previously claimed into the proofs at this point
    const totalTICAmount = userTicConsumed.add(userPoolData.totalClaimedTic);
    const totalLPTokenAmount = userLPTokens.add(userPoolData.totalClaimedLP);
    claims[address] = {
      index,
      poolId: poolData.poolId,
      totalLPTokenAmount,
      totalTICAmount,
      proof: '', // we have to generate this after the entire tree is ready.
    };
    index += 1;
  });
  return claims;
};

export const getMerkleData = (chainData, allocationData, config) => {
  const merkleData = {
    epoch: config.epoch,
    snapshotTimestamp: config.snapshotTimestamp,
    chains: {},
  };

  for (let i = 0; i < config.chains.length; i += 1) {
    const chain = config.chains[i];
    const chainMerkleData = {
      ...chain,
    };

    const poolData = {};
    const poolCount = Object.keys(chainData.chains[chain.chainId].pools).length;
    let startingIndex = 0;
    for (let ii = 0; ii < poolCount; ii += 1) {
      const pool = {
        poolId: ii,
        claims: {},
      };
      const claims = getMerkleClaimsForPool(
        startingIndex,
        chain,
        chainData.chains[chain.chainId].pools[ii],
        allocationData.chains[chain.chainId].pools[ii].poolPercentOfChain,
      );
      pool.claims = claims;
      poolData[ii] = pool;
      startingIndex += Object.keys(claims).length;
    }

    // we now have all the data for this chain, generate our balance tree.
    const tree = new BalanceTree(poolData);
    chainMerkleData.merkleRoot = tree.getHexRoot();

    // now we can finally generate the needed proofs since we have the entire tree.
    for (let iii = 0; iii < poolCount; iii += 1) {
      const { claims } = poolData[iii];
      const addresses = Object.keys(claims);
      addresses.forEach((address) => {
        const claim = claims[address];
        claim.proof = tree.getProof(
          claim.index,
          address,
          iii,
          claim.totalLPTokenAmount,
          claim.totalTICAmount,
        );
      });
    }
    chainMerkleData.pools = poolData;
    merkleData.chains[chain.chainId] = chainMerkleData;
  }

  return merkleData;
};

export const getMerklePools = (chain, provider, tokenDeployments) => {
  let merklePoolsDeployInfo;
  if (chain.supportsNativeTIC) {
    merklePoolsDeployInfo = tokenDeployments[chain.chainId][0].contracts.MerklePools;
  } else {
    merklePoolsDeployInfo = tokenDeployments[chain.chainId][0].contracts.MerklePoolsForeign;
  }

  return new ethers.Contract(merklePoolsDeployInfo.address, merklePoolsDeployInfo.abi, provider);
};

export const getPoolUnclaimedTicData = async (
  userAddresses,
  forfeitAddress,
  poolId,
  snapshotBlock,
  merklePools,
) => {
  const allAddresses = userAddresses.concat([forfeitAddress]);

  const unclaimedTicAtSnapshot = await Promise.all(
    allAddresses.map((user) =>
      merklePools.getStakeTotalUnclaimed(user, poolId, { blockTag: snapshotBlock }),
    ),
  );

  const stakesAtSnapshot = await Promise.all(
    allAddresses.map((user) => merklePools.stakes(user, poolId, { blockTag: snapshotBlock })),
  );

  const poolData = {
    users: {},
    totalSummedUnclaimedTic: ZERO,
    unclaimedTic: await merklePools.getPoolTotalUnclaimedNotInLP(poolId, {
      blockTag: snapshotBlock,
    }),
  };

  for (let i = 0; i < allAddresses.length; i += 1) {
    const user = allAddresses[i];
    const unclaimedTicBalance = unclaimedTicAtSnapshot[i];
    const stake = stakesAtSnapshot[i];
    poolData.users[user] = {
      totalUnclaimedTic: unclaimedTicBalance,
      totalClaimedTic: stake.totalRealizedTIC,
      totalClaimedLP: stake.totalRealizedLP,
    };
    poolData.totalSummedUnclaimedTic = poolData.totalSummedUnclaimedTic.add(unclaimedTicBalance);
  }
  return poolData;
};

/**
 * Process all events in the eventsToIndex array and adds them to eventMapping first
 * indexed by the poolId and then by the user address
 * @param {Array} eventsToIndex
 * @param {Object} poolUserData - mapping of indexed events to add new events to
 * @returns the modified event mapping (same as the original, no cloning is done)
 */
export const indexEventsByPoolByUser = (eventsToIndex, poolUserData) => {
  eventsToIndex.forEach((event) => {
    const { user, amount } = event.args;
    const poolId = event.args.poolId.toNumber();

    let poolEvents;
    if (poolUserData[poolId] === undefined) {
      poolEvents = {};
      poolUserData[poolId] = poolEvents;
    } else {
      poolEvents = poolUserData[poolId];
    }

    let userInstance;
    if (poolEvents[user] === undefined) {
      userInstance = {
        events: {},
        balanceSeconds: ZERO,
      };
      poolEvents[user] = userInstance;
    } else {
      userInstance = poolEvents[user];
    }

    if (userInstance.events[event.blockNumber]) {
      // currently we assume that users only take one action per block per pool,
      // just to be safe throw an error if something breaks our assumptions!
      throw new Error(`Found existing event for user ${user} at block number ${event.blockNumber}`);
    }

    userInstance.events[event.blockNumber] = {
      event: event.event,
      transactionHash: event.transactionHash,
      user,
      poolId,
      amount,
    };
  });
  return poolUserData;
};
