import { ethers } from "ethers";
import tokenDeployments from '@elasticswap/token/artifacts/deployments.json' assert { type: 'json'};

const EPOCH_LENGTH = 2*7*24*60*60;  // 2 week epochs
const GENESIS_BLOCK = 13720539;
const RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';
const BLOCK_REQUEST_LIMIT = 2048;

// we need to get all TokensDeposited events and TokensWithdrawn event
async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const merklePoolsDeployInfo = tokenDeployments[43114][0].contracts.MerklePools;
  const merklePools = new ethers.Contract(merklePoolsDeployInfo.address, merklePoolsDeployInfo.abi, provider);
  const filter = merklePools.filters.TokensDeposited();
  //const genesisBlock = await provider.getBlock(GENESIS_BLOCK);
  const currentBlock = await provider.getBlockNumber();
  console.log(currentBlock);
  let tokenDepositedEvents = [];
  let requestedBlock = GENESIS_BLOCK;
  while(requestedBlock < currentBlock) {
    const nextRequestedBlock = requestedBlock + BLOCK_REQUEST_LIMIT;
    const events = await merklePools.queryFilter(
      filter, 
      requestedBlock, 
      nextRequestedBlock < currentBlock ? nextRequestedBlock : currentBlock
    );
    if(events.length > 0) {
      tokenDepositedEvents = tokenDepositedEvents.concat(events);
    }
    requestedBlock = nextRequestedBlock;
  } 
  console.log(`Found ${tokenDepositedEvents.length} TokensDeposited events`);
}



main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });