// Minimal ABI for DarkPoolSettlement.sol on Sepolia
export const DARKPOOL_ABI = [
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "registerOrder",
    inputs: [
      { name: "requestId", type: "bytes32" },
      { name: "traderA", type: "address" },
      { name: "traderB", type: "address" }
    ],
    outputs: []
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "settleMatch",
    inputs: [
      { name: "requestId", type: "bytes32" },
      { name: "encPriceA", type: "bytes" },
      { name: "inputProofA", type: "bytes" },
      { name: "encPriceB", type: "bytes" },
      { name: "inputProofB", type: "bytes" }
    ],
    outputs: []
  },
  {
    stateMutability: "nonpayable",
    type: "function",
    name: "requestPublicDecryption",
    inputs: [{ name: "requestId", type: "bytes32" }],
    outputs: []
  }
];

export const CONTRACT_ADDRESS = "0x531d76b2C94899017e94158304DF32C2188FFA23";
export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/riUDz5ZMLWoKuEiIfWG5N";

// Helper to generate fake ciphertext for demo
export function generateFakeCiphertext(): string {
  const random = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return "0x" + Array(64).fill(0).map(() => random.charAt(Math.floor(Math.random() * random.length))).join("");
}
