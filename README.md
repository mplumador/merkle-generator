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


---------------------------
New algorithm....

All we care about is unrealized TIC at a given snapshot. Once we have the unrealized TIC for each
user at the snapshot, we can sum across all pools.  If a user un-stakes, they automatically lose their
unrealized TIC (in the contract and also cannot claim). If a user adds, this is also handled automatically.

The only complexity is considering their previous claim state into the new tree.

------------
1. get all stakers for a pool through tokens deposit events
1. get all stakers unrealized TIC at the given snapshot
1. sum all unrealized TIC for pool
1. sum all unrealized TIC across all pools
1. determine each pools needed allocation of USDC (this isn't the weights since weights can change)
1. Once USDC has been added to pool, determine how much ELP was generated (slippage means this has to be done first)
  1. Also need to determine how much TIC was consumed and then debit that across users unclaimed TIC
  in the tree.
1. generate and publish tree.

- What happens if the user doesn't claim?
    we need to subtract their unclaimed merkle node TIC amount and take that into account.
    otherwise their unclamed (but claimable) ELP is counting towards more than it should be
    of the unrealized pot!
