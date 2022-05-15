import { readFileSync, writeFileSync } from 'fs';
import config from '../config.json' assert { type: 'json' };
import { bigNumberJSONToString, getMerkleData } from './utils.mjs';

async function main() {
  console.log(`Prepping Merkle tree for epoch=${config.epoch}`);
  const chainData = JSON.parse(readFileSync(`${config.epoch}_chainData.json`));
  const allocationData = JSON.parse(readFileSync(`${config.epoch}_allocationData.json`));
  const merkleTree = getMerkleData(chainData, allocationData, config);
  writeFileSync(
    `${config.epoch}_merkleTree.json`,
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
