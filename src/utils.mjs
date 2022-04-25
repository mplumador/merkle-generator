import { ethers } from 'ethers';

const BLOCK_REQUEST_LIMIT = 2048;
const ZERO = ethers.BigNumber.from('0');
const blockNumberToTimestamp = {}; // cached block numbers to timestamp

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
      return allEvents;
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

export const calculateUserBalanceSeconds = async (epoch, merklePools, poolId, poolUserData) => {
  const userData = poolUserData[poolId];
  const userAddresses = Object.keys(userData);
  const userBalancesAtEndOfEpoch = await Promise.all(
    userAddresses.map((user) =>
      merklePools.getStakeTotalDeposited(user, poolId, { blockTag: epoch.endBlock }),
    ),
  );

  // for each user, iterate back through block to the start of the epoch and calculate
  // their balanceSeconds.
  for(let i = 0; i < userAddresses.length; i++) {
    const user = userAddresses[i];
    const balance = userBalancesAtEndOfEpoch[i];
    if(balance.eq(ZERO)) {
      //TODO: these should go to the forfeit address!
      continue;
    }

    const userEvents = userData[user].events;
    if(userEvents.length === 0) {
      // user has had the same balance the whole time!

      continue;
    }

    // find any events that occurred or this user and sort them by block number!
    const eventBlockNumbers = Object.keys(userData[user].events).sort();
    
    
  }
}

export const getBlockTimestamp = async (blockNumber, provider) => {
  if(blockNumberToTimestamp[blockNumber]) {
    return blockNumberToTimestamp[blockNumber];
  }
  const block = await provider.getBlock(blockNumber)
  blockNumberToTimestamp[blockNumber] = block.timestamp;
  return block.timestamp;
}
