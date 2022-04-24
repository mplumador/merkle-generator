import { ethers } from 'ethers';
import tokenDeployments from '@elasticswap/token/artifacts/deployments.json' assert { type: 'json' };
import {
  getAllTokensDepositedEvents,
  getAllTokensWithdrawnEvents,
  indexEventsByPoolByUser,
} from './stakers.mjs';

const EPOCH_LENGTH = 2 * 7 * 24 * 60 * 60; // 2 week epochs
const GENESIS_BLOCK = 13720539;
const RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const merklePoolsDeployInfo = tokenDeployments[43114][0].contracts.MerklePools;
  const merklePools = new ethers.Contract(
    merklePoolsDeployInfo.address,
    merklePoolsDeployInfo.abi,
    provider,
  );
  // const genesisBlock = await provider.getBlock(GENESIS_BLOCK);
  const currentBlock = await provider.getBlockNumber();
  const tokensDepositedEvents = await getAllTokensDepositedEvents(
    merklePools,
    GENESIS_BLOCK,
    currentBlock,
  );
  const tokensWithdrawnEvents = await getAllTokensWithdrawnEvents(
    merklePools,
    GENESIS_BLOCK,
    currentBlock,
  );

  console.log(`Found ${tokensDepositedEvents.length} TokensDeposited events`);
  console.log(`Found ${tokensWithdrawnEvents.length} TokensWithdrawn events`);

  const indexedEvents = {};
  indexEventsByPoolByUser(tokensDepositedEvents, indexedEvents);
  indexEventsByPoolByUser(tokensWithdrawnEvents, indexedEvents);

  // at this point we now have all events indexed by poolId and then user address.
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
