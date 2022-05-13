import { ethers } from 'ethers';
import tokenDeployments from '@elasticswap/token/artifacts/deployments.json' assert { type: 'json' };
import chainConfig from '../chainconfig.json' assert { type: 'json' };
import {
  getAllTokensDepositedEvents,
  getPoolUnclaimedTicData,
  indexEventsByPoolByUser,
} from './utils.mjs';
import 'dotenv/config';

async function main() {

  // load in chain configs
  for(var i = 0; i < chainConfig.chains.length; i++) {
    const chain = chainConfig.chains[i];
    const rpcURL = process.env[`RPC_URL_${chain.chain.toUpperCase()}`];
    const provider = new ethers.providers.JsonRpcProvider(rpcURL);

    let merklePoolsDeployInfo;
    if(chain.supportsNativeTIC) {
      merklePoolsDeployInfo = tokenDeployments[chain.chainId][0].contracts.MerklePools;
    } else {
      merklePoolsDeployInfo = tokenDeployments[chain.chainId][0].contracts.MerklePoolsForeign;
    }
    
    const merklePools = new ethers.Contract(
      merklePoolsDeployInfo.address,
      merklePoolsDeployInfo.abi,
      provider,
    );

    const currentBlock = await provider.getBlockNumber(); // for now use this as our "snapshot"
    const tokensDepositedEvents = await getAllTokensDepositedEvents(
      merklePools,
      chain.genesisBlock,
      currentBlock,
    );

    console.log(`Found ${tokensDepositedEvents.length} TokensDeposited events`);

    const poolUserData = {};
    indexEventsByPoolByUser(tokensDepositedEvents, poolUserData);

    // at this point we now have all events indexed by poolId and then user address.
    // from here we need to find all of the users unclaimed TIC balances and then sum them
    // across users and then across pools
    const forfeitAddress = await merklePools.forfeitAddress();
    const poolCount = await merklePools.poolCount();
    const poolData = {};
    for (let i = 0; i < poolCount; i++) {
      poolData[i] = await getPoolUnclaimedTicData(
        Object.keys(poolUserData[i]),
        forfeitAddress,
        i,
        currentBlock,
        merklePools,
      );
    }
    console.log(JSON.stringify(poolData));
    // TODO: we need to handle unclaimed merkle nodes from the last distro!
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
