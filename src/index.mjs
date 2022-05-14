import { ethers } from 'ethers';
import tokenDeployments from '@elasticswap/token/artifacts/deployments.json' assert { type: 'json' };
import config from '../config.json' assert { type: 'json' };
import {
  bigNumberJSONToString,
  getChainUnclaimedTicData,
} from './utils.mjs';
import 'dotenv/config';
import { writeFileSync } from  'fs';

async function main() {
  const data = {};
  let totalUnclaimedTIC = ethers.constants.Zero;
  let totalSummedUnclaimedTic = ethers.constants.Zero;

  for(var i = 0; i < config.chains.length; i++) {
    const chain = config.chains[i];
    const rpcURL = process.env[`RPC_URL_${chain.name.toUpperCase()}`];
    const provider = new ethers.providers.JsonRpcProvider(rpcURL);

    const chainData = await getChainUnclaimedTicData(chain, provider, tokenDeployments);
    
    // NOTE: this is somewhat incorrect, after the first distro we will need to take into account
    // the amount that is unclaimed in the merkle tree as well if the user hasn't claimed it!
    totalUnclaimedTIC = totalUnclaimedTIC.add(chainData.totalUnclaimedTIC);
    totalSummedUnclaimedTic = totalSummedUnclaimedTic.add(chainData.totalSummedUnclaimedTic);
    data[chain.chainId] = chainData;
    // TODO: we need to handle unclaimed merkle nodes from the last distro
    // by checking their unclaimed TIC against the node and what they have claimed...
    // some users may never claim,
  }

  // save our totals
  data.totalUnclaimedTIC = totalUnclaimedTIC;
  data.totalSummedUnclaimedTic = totalSummedUnclaimedTic;
  
  // write to disk
  console.log('Persisting chain data to disk at chainData.json');
  writeFileSync('chainData.json', JSON.stringify(data, bigNumberJSONToString, 2));
  console.log('generate chain data to disk completed');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
