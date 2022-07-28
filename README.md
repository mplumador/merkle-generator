# merkle-generator
ElasticSwap merkle tree generator for reward pools 

##### Set up
To run this, you will need access to full archive nodes for both AVAX and Ethereum. These URLs can
then be set in your `.env` file that is a copy of what you find in `.env.example`

#### How to:

1. Determine snapshot blocks for each chain and update config.json, increment epoch
1. Call `yarn prep` to prep all data and  generate percentages per chain per pool of USD to allocate. Bridge needed
assets and generate LP on each chain and each pool.
1. update config with values for each chain on the LP generated and TIC consumed
1. Run `yarn merkle` and generate tree
1. Publish to IPFS.
1. Set the root on each chain MerklePools to enable claiming.
