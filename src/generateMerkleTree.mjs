import { readFileSync, writeFileSync } from 'fs';
import config from '../config.json' assert { type: 'json' };
import { bigNumberJSONToString, getMerkleData } from './utils.mjs';

async function main() {
  console.log(`Prepping Merkle tree for epoch=${config.epoch}`);
  const chainData = JSON.parse(readFileSync(`./data/${config.epoch}_chainData.json`));
  const allocationData = JSON.parse(readFileSync(`./data/${config.epoch}_allocationData.json`));
  let previousMerkleTree;
  if (config.epoch > 0) {
    // we need to load the previous tree for reference of unclaimed claims.
    previousMerkleTree = JSON.parse(readFileSync(`./data/${config.epoch - 1}_merkleTree.json`));
  }
  const merkleTree = getMerkleData(chainData, allocationData, previousMerkleTree, config);
  writeFileSync(
    `./data/${config.epoch}_merkleTree.json`,
    JSON.stringify(merkleTree, bigNumberJSONToString, 2),
  );
  console.log('Tree created, saved to disk.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
