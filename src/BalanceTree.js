const { utils } = require("ethers");
const { MerkleTree } = require("./MerkleTree");

class BalanceTree {
  constructor(poolData) {
    let nodes = [];
    const poolCount = Object.keys(poolData).length;
    for (let i = 0; i < poolCount; i += 1) {
      const claims = poolData[i].claims;
      const addresses = Object.keys(claims);
      nodes = nodes.concat(addresses.map((address) => {
        const node = BalanceTree.toNode(
          claims[address].index,
          address,
          i,
          claims[address].totalLPTokenAmount,
          claims[address].totalTICAmount,
        )
        return node;
      }));
    }
    this._tree = new MerkleTree(nodes);
  }

  static verifyProof(
    index,
    account,
    poolId,
    totalLPTokenAmount,
    totalTICAmount,
    proof,
    root
  ) {
    let pair = BalanceTree.toNode(
      index,
      account,
      poolId,
      totalLPTokenAmount,
      totalTICAmount
    );
    // eslint-disable-next-line no-restricted-syntax
    for (const item of proof) {
      pair = MerkleTree.combinedHash(pair, item);
    }

    return pair.equals(root);
  }

  // keccak256(abi.encode(index, account, amount))
  static toNode(index, account, poolId, totalLPTokenAmount, totalTICAmount) {
    return Buffer.from(
      utils
        .solidityKeccak256(
          ["uint256", "address", "uint256", "uint256", "uint256"],
          [index, account, poolId, totalLPTokenAmount, totalTICAmount]
        )
        .substr(2),
      "hex"
    );
  }

  getHexRoot() {
    return this._tree.getHexRoot();
  }

  // returns the hex bytes32 values of the proof
  getProof(index, account, poolId, totalLPTokenAmount, totalTICAmount) {
    return this._tree.getHexProof(
      BalanceTree.toNode(
        index,
        account,
        poolId,
        totalLPTokenAmount,
        totalTICAmount
      )
    );
  }
}

module.exports = { BalanceTree };
