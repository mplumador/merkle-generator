import { ethers } from 'ethers';

const BLOCK_REQUEST_LIMIT = 2048;
const ZERO = ethers.BigNumber.from('0');
const blockNumberToTimestamp = {}; // cached block numbers to timestamp
const TOKENS_DEPOSITED = 'TokensDeposited';
const TOKENS_WITHDRAWN = 'TokensWithdrawn';

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

export const calculateAllUserBalanceSeconds = async (
  epoch,
  merklePools,
  poolId,
  poolUserData,
  provider,
) => {
  const userData = poolUserData[poolId];
  const userAddresses = Object.keys(userData);
  let forfeitBalanceSecondsTotal = ZERO;
  let userBalanceSecondsTotal = ZERO;
  const userBalancesAtEndOfEpoch = await Promise.all(
    userAddresses.map((user) =>
      merklePools.getStakeTotalDeposited(user, poolId, { blockTag: epoch.endBlock }),
    ),
  );

  const userBalancesAtStartOfEpoch = await Promise.all(
    userAddresses.map((user) =>
      merklePools.getStakeTotalDeposited(user, poolId, { blockTag: epoch.startBlock }),
    ),
  );

  // for each user, iterate back through block to the start of the epoch and calculate
  // their balanceSeconds.
  for (let i = 0; i < userAddresses.length; i++) {
    const user = userAddresses[i];
    const userValues = await calculateUserBalanceSeconds(
      epoch,
      provider,
      user,
      userBalancesAtStartOfEpoch[i],
      userBalancesAtEndOfEpoch[i],
      userData[user].events,
    );
    userData[user].balanceSeconds = userValues.userBalanceSeconds;
    userBalanceSecondsTotal = userBalanceSecondsTotal.add(userValues.userBalanceSeconds);
    forfeitBalanceSecondsTotal = forfeitBalanceSecondsTotal.add(userValues.forfeitBalanceSeconds);
  }
  userData.userBalanceSecondsTotal = userBalanceSecondsTotal;
  userData.forfeitBalanceSecondsTotal = forfeitBalanceSecondsTotal;
};

export const calculateUserBalanceSeconds = async (
  epoch,
  provider,
  user,
  userBalanceAtStartOfEpoch,
  userBalanceAtEndOfEpoch,
  userEvents,
) => {
  let forfeitBalanceSeconds = ZERO;
  const epochStartTimestamp = await getBlockTimestamp(epoch.startBlock, provider);
  const epochEndTimestamp = await getBlockTimestamp(epoch.endBlock, provider);
  const epochDuration = epochEndTimestamp - epochStartTimestamp;
  if (userEvents.length === 0) {
    // user has had the same balance the whole time!
    if (!userBalanceAtEndOfEpoch.eq(userBalanceAtStartOfEpoch)) {
      throw new Error(
        `User ${user} has no events, but a staked balance change! balanceAtStart=${userBalanceAtStartOfEpoch.toString()} balanceAtEnd=${userBalanceAtEndOfEpoch.toString()}`,
      );
    }
    return {
      userBalanceSeconds: userBalanceAtEndOfEpoch.mul(epochDuration),
      forfeitBalanceSeconds,
    };
  }
  // find any events that occurred or this user and sort them by block number!
  const eventBlockNumbers = Object.keys(userEvents).sort();
  let userBalanceSeconds = ZERO;
  let lastBalance = userBalanceAtStartOfEpoch;
  let lastTimestamp = epochStartTimestamp;
  for (let ii = 0; ii < eventBlockNumbers.length; ii++) {
    const eventBlockNumber = eventBlockNumbers[ii];
    if (eventBlockNumber <= epoch.startBlock || eventBlockNumber > epoch.endBlock) {
      // this event occurs before our epoch or after our epoch
      continue;
    }
    const event = userEvents[eventBlockNumber];
    const eventTimestamp = await getBlockTimestamp(eventBlockNumber, provider);
    const elapsedTime = eventTimestamp - lastTimestamp;
    userBalanceSeconds = userBalanceSeconds.add(lastBalance.mul(elapsedTime));
    lastTimestamp = eventTimestamp;
    if (event.event === TOKENS_DEPOSITED) {
      // user has increased their balance, record their userBalance until now and set new balance
      // going forward.
      lastBalance = lastBalance.add(event.amount);
    } else if (event.event === TOKENS_WITHDRAWN) {
      forfeitBalanceSeconds = forfeitBalanceSeconds.add(userBalanceSeconds);
      userBalanceSeconds = ZERO;
      lastBalance = ZERO;
    } else {
      throw new Error(`Unexpected event ${event.event} found for user ${user}`);
    }
  }

  // we now just need to handle the time period since the last event and the end of the epoch!
  if (!lastBalance.eq(ZERO)) {
    // the user has a balance.
    const elapsedTime = epochEndTimestamp - lastTimestamp;
    userBalanceSeconds = userBalanceSeconds.add(lastBalance.mul(elapsedTime));
  }
  return {
    userBalanceSeconds,
    forfeitBalanceSeconds,
  };
};

export const getBlockTimestamp = async (blockNumber, provider) => {
  const blockNumberParsed = parseInt(blockNumber);
  if (blockNumberToTimestamp[blockNumberParsed]) {
    return blockNumberToTimestamp[blockNumberParsed];
  }
  const block = await provider.getBlock(blockNumberParsed);
  blockNumberToTimestamp[blockNumberParsed] = block.timestamp;
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
    poolData.users[user] = unclaimedTicBalance;
    poolData.totalSummedUnclaimedTic = poolData.totalSummedUnclaimedTic.add(unclaimedTicBalance);
  }
  return poolData;
};
