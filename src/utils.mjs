import { ethers } from 'ethers';

const BLOCK_REQUEST_LIMIT = 2048;
const ZERO = ethers.BigNumber.from('0');
const DECIMAL_PRECISION = 10000000000;
const blockNumberToTimestamp = {}; // cached block numbers to timestamp by chainId

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

export const getAllEvents = async (merklePools, genesisBlockNumber, currentBlockNumber, filter) => {
  let allEvents = [];
  let requestedBlock = genesisBlockNumber;
  while (requestedBlock < currentBlockNumber) {
    const nextRequestedBlock = requestedBlock + BLOCK_REQUEST_LIMIT;
    const events = await merklePools.queryFilter(
      filter,
      requestedBlock,
      nextRequestedBlock < currentBlockNumber ? nextRequestedBlock : currentBlockNumber,
    );
    if (events.length > 0) {
      allEvents = allEvents.concat(events);
      // for testing return here.... TODO: make sure to remove me!
      // return allEvents;
    }
    requestedBlock = nextRequestedBlock;
  }
  return allEvents;
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

export const getBlockTimestamp = async (blockNumber, chainId, provider) => {
  const blockNumberParsed = parseInt(blockNumber);
  if (blockNumberToTimestamp[chainId] && blockNumberToTimestamp[chainId][blockNumberParsed]) {
    console.log('cached');
    return blockNumberToTimestamp[chainId][blockNumberParsed];
  }
  const block = await provider.getBlock(blockNumberParsed);

  if (!blockNumberToTimestamp[chainId]) {
    blockNumberToTimestamp[chainId] = {};
  }

  blockNumberToTimestamp[chainId][blockNumberParsed] = block.timestamp;
  return block.timestamp;
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

  for (let i = 0; i < allAddresses.length; i++) {
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

export const getMerklePools = (chain, provider, tokenDeployments) => {
  let merklePoolsDeployInfo;
  if (chain.supportsNativeTIC) {
    merklePoolsDeployInfo = tokenDeployments[chain.chainId][0].contracts.MerklePools;
  } else {
    merklePoolsDeployInfo = tokenDeployments[chain.chainId][0].contracts.MerklePoolsForeign;
  }

  return new ethers.Contract(merklePoolsDeployInfo.address, merklePoolsDeployInfo.abi, provider);
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

  for (let i = 0; i < poolCount; i++) {
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

export const bigNumberJSONToString = (key, value) => {
  if (value && value.type && value.type === 'BigNumber') {
    return ethers.BigNumber.from(value.hex).toString();
  }
  return value;
};

export const generateAllocationData = async (chainData, config, tokenDeployments) => {
  const totalUnclaimedTIC = ethers.BigNumber.from(chainData.totalUnclaimedTIC);
  const allocations = {};
  for (let i = 0; i < config.chains.length; i++) {
    const chain = config.chains[i];
    const rpcURL = process.env[`RPC_URL_${chain.name.toUpperCase()}`];
    const provider = new ethers.providers.JsonRpcProvider(rpcURL);

    const totalUnclaimedTicForChain = ethers.BigNumber.from(
      chainData[chain.chainId].totalUnclaimedTIC,
    );
    const percentAllocation =
      totalUnclaimedTicForChain.mul(DECIMAL_PRECISION).div(totalUnclaimedTIC).toNumber() /
      DECIMAL_PRECISION;
    const chainAllocations = {
      pools: {},
      percentAllocation,
    };

    const merklePools = getMerklePools(chain, provider, tokenDeployments);
    const poolCount = await merklePools.poolCount();
    const { pools } = chainData[chain.chainId];
    for (let ii = 0; ii < poolCount; ii++) {
      const totalUnclaimedForPool = ethers.BigNumber.from(pools[ii].unclaimedTic);
      chainAllocations.pools[ii] =
        totalUnclaimedForPool.mul(DECIMAL_PRECISION).div(totalUnclaimedTIC).toNumber() /
        DECIMAL_PRECISION;
    }
    allocations[chain.chainId] = {
      name: chain.name,
      chainId: chain.chainId,
      ...chainAllocations,
    };
  }
  return allocations;
};
