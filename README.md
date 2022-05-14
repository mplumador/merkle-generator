# merkle-generator
ElasticSwap merkle tree generator for reward pools 

#### How to:

1. Determine snapshot blocks for each chain and update chainconfig.json
2. Populate IPFS CID of last merkle tree.
3. Run script X first to generate percentages per chain per pool of USD to allocate. Bridge needed
assets and generate LP on each chain and each pool.
4. Run script Y with updated LP values and produce updated merkle tree
5. Publish to IPFS
6. set the root on each chain to enable claiming.


- What happens if the user doesn't claim?
    we need to subtract their unclaimed merkle node TIC amount and take that into account.
    otherwise their unclamed (but claimable) ELP is counting towards more than it should be
    of the unrealized pot!
