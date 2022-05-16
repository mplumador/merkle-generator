import tokenDeployments from '@elasticswap/token/artifacts/deployments.json' assert { type: 'json' };
import { readFileSync, writeFileSync } from 'fs';
import config from '../config.json' assert { type: 'json' };
import { bigNumberJSONToString, getChainData, getAllocationData } from './utils.mjs';

async function main() {
  console.log(`Prepping data for epoch=${config.epoch}`);
  await generateChainData();
  generateAllocations();
  console.log('Data prep completed, saved to disk.');
  console.log('Please generate LP tokens and updated config.json');
}

async function generateChainData() {
  const data = await getChainData(config, tokenDeployments);
  // write to disk
  writeFileSync(`${config.epoch}_chainData.json`, JSON.stringify(data, bigNumberJSONToString, 2));
}

function generateAllocations() {
  const chainDataRaw = readFileSync(`${config.epoch}_chainData.json`);
  const chainData = JSON.parse(chainDataRaw);
  const allocationData = getAllocationData(chainData, config);
  writeFileSync(
    `${config.epoch}_allocationData.json`,
    JSON.stringify(allocationData, bigNumberJSONToString, 2),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
