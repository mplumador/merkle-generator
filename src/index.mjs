import tokenDeployments from '@elasticswap/token/artifacts/deployments.json' assert { type: 'json' };
import { readFileSync, writeFileSync } from 'fs';
import config from '../config.json' assert { type: 'json' };
import { bigNumberJSONToString, getChainData, getAllocationData, getMerkleData } from './utils.mjs';
import 'dotenv/config';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`Prepping Merkle tree for epoch=${config.epoch}`);
    generateMerkleTree();
    console.log('Tree created, saved to disk.');
    return;
  } if (args.length === 2) {
    if (args[0] === '--prep' && args[1] === 'true') {
      console.log(`Prepping data for epoch=${config.epoch}`);
      await generateChainData();
      generateAllocations();
      console.log('Data prep completed, saved to disk.');
      console.log('Please generate LP tokens and updated config.json');
      return;
    }
  }
  throw new Error('unexpected args!');
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
