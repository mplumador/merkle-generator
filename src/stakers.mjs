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
    }
    requestedBlock = nextRequestedBlock;
  }   
  return allEvents;
}