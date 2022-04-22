# merkle-generator
ElasticSwap merkle tree generator for reward pools 

#### Important links
 - [Genesis transaction on block #13720539](https://snowtrace.io/tx/0xf320dd71c27c728687a4b9e2dd1c51b24e3d4563e68784d54f1d2145a8940c1d)

#### General algorithm


1. For each pool, find all unique stakers that exist at the end of the epoch.
1. Find average balanceSeconds of staker in epoch.  
1. Handle edge cases:
    1. Staker increased balance
    1. Staker unstaked and restaked
1. Sum all balanceSeconds for all stakers in the pool 
1. Calculate rewards owed to the pool, divide by balanceSeconds for rewardPerBalanceSecond
1. calculate each addresses net new reward amount
1. Determine their previous reward amount, and sum these
    1. Edge case: where a user has previously exited and we need to make sure the new claim is 
    handled correctly since when they exit we do `stake.totalRealizedTIC += stake.totalUnrealized;`
1. Persist to IPFS

