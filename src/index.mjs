import tokenDeployments from '@elasticswap/token/artifacts/deployments.json' assert { type: 'json' };
import { readFileSync, writeFileSync } from 'fs';
import config from '../config.json' assert { type: 'json' };
import { bigNumberJSONToString, getChainData, getAllocationData, getMerkleData } from './utils.mjs';
import 'dotenv/config';

async function main() {
  //await generateChainData();
  generateAllocations();
  generateMerkleTree();
}

async function generateChainData() {
  const data = await getChainData(config, tokenDeployments);
  // write to disk
  console.log('Persisting chain data to disk at chainData.json');
  writeFileSync(`${config.epoch}_chainData.json`, JSON.stringify(data, bigNumberJSONToString, 2));
  console.log('generate chain data to disk completed');
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

function generateMerkleTree() {
  const chainData = JSON.parse(readFileSync(`${config.epoch}_chainData.json`));
  const allocationData = JSON.parse(readFileSync(`${config.epoch}_allocationData.json`));
  const merkleTree = getMerkleData(chainData, allocationData, config);
  writeFileSync(
    `${config.epoch}_merkleTree.json`,
    JSON.stringify(merkleTree, bigNumberJSONToString, 2),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
