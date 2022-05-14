import tokenDeployments from '@elasticswap/token/artifacts/deployments.json' assert { type: 'json' };
import { readFileSync, writeFileSync } from 'fs';
import config from '../config.json' assert { type: 'json' };
import { bigNumberJSONToString, getChainData, getAllocationData } from './utils.mjs';
import 'dotenv/config';

async function main() {
  await generateChainData();
  await generateAllocations();
}

async function generateChainData() {
  const data = getChainData(config, tokenDeployments);
  // write to disk
  console.log('Persisting chain data to disk at chainData.json');
  writeFileSync(`${config.index}_chainData.json`, JSON.stringify(data, bigNumberJSONToString, 2));
  console.log('generate chain data to disk completed');
}

async function generateAllocations() {
  const chainDataRaw = readFileSync(`${config.index}_chainData.json`);
  const chainData = JSON.parse(chainDataRaw);
  const allocationData = await getAllocationData(chainData, config, tokenDeployments);
  writeFileSync(
    `${config.index}_allocationData.json`,
    JSON.stringify(allocationData, bigNumberJSONToString, 2),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
