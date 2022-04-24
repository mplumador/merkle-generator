import { isTransactionHash } from "../../elasticswap-sdk/src/utils/typeChecks.mjs";

const BLOCK_REQUEST_LIMIT = 2048;

export const getAllTokensDepositedEvents = async (merklePools, genesisBlockNumber, currentBlockNumber ) => {
  return getAllEvents(merklePools, genesisBlockNumber, currentBlockNumber, merklePools.filters.TokensDeposited());
}

export const getAllTokensWithdrawnEvents = async (merklePools, genesisBlockNumber, currentBlockNumber ) => {
  return getAllEvents(merklePools, genesisBlockNumber, currentBlockNumber, merklePools.filters.TokensWithdrawn());
}

export const getAllEvents = async (merklePools, genesisBlockNumber, currentBlockNumber, filter) => {
  let allEvents = [];
  let requestedBlock = genesisBlockNumber;
  while(requestedBlock < currentBlockNumber) {
    const nextRequestedBlock = requestedBlock + BLOCK_REQUEST_LIMIT;
    const events = await merklePools.queryFilter(
      filter, 
      requestedBlock, 
      nextRequestedBlock < currentBlockNumber ? nextRequestedBlock : currentBlockNumber
    );
    if(events.length > 0) {
      allEvents = allEvents.concat(events);
      // for testing return here.... TODO: make sure to remove me!
      return allEvents;
    }
    requestedBlock = nextRequestedBlock;
  }   
  return allEvents;
}

/**
 * Process all events in the eventsToIndex array and adds them to eventMapping first
 * indexed by the poolId and then by the user address
 * @param {Array} eventsToIndex 
 * @param {Object} eventMapping - mapping of indexed events to add new events to
 * @returns the modified event mapping (same as the original, no cloning is done)
 */
export const indexEventsByPoolByUser = (eventsToIndex, eventMapping) => {
  eventsToIndex.forEach((event) => {
    const user = event.args.user;
    const poolId = event.args.poolId.toNumber();
    const amount = event.args.amount;
    
    let poolEvents;
    if(eventMapping[poolId] === undefined) {
      poolEvents = {};
      eventMapping[poolId] = poolEvents;
    } else {
      poolEvents = eventMapping[poolId];
    }
    
    let userEvents;;
    if(poolEvents[user] === undefined ) {
      userEvents = {};
      poolEvents[user] = userEvents;
    } else {
      userEvents = poolEvents[user];
    }

    if(userEvents[event.blockNumber]) {
      // currently we assume that users only take one action per block per pool,
      // just to be safe throw an error if something breaks our assumptions!       
      throw new Error(`Found existing event for user ${user} at block number ${event.blockNumber}`);
    }
    
    userEvents[event.blockNumber] = {
      event: event.event,
      transactionHash: event.transactionHash,
      user,
      poolId,
      amount,
    }
  });
  return eventMapping;
}