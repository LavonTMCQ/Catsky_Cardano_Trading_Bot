//swap.js — 1 ADA ➜ CATSKY (Mainne

import dotenv from "dotenv";
dotenv.config();

import {
  ADA,
  Asset,
  BlockfrostAdapter,
  calculateAmountWithSlippageTolerance,
  DexV2,
  DexV2Calculation,
  NetworkId,
} from "@minswap/sdk";
import { Lucid, Blockfrost, Data } from "lucid-cardano";
import { BlockFrostAPI } from "@blockfrost/blockfrost-js";
import { OrderV2 } from "@minswap/sdk";

console.log("BF_PROJECT_ID:", process.env.BF_PROJECT_ID);
console.log("MNEMONIC:", process.env.MNEMONIC ? "Loaded" : "Not loaded");
  
// CONFIG — YOUR KEYS HERE
const BF_PROJECT_ID = process.env.BF_PROJECT_ID;
const MNEMONIC =  process.env.MNEMONIC;
const SLIPPAGE_PCT = 0.5;
const CATSKY = Asset.fromString("9b426921a21f54600711da0be1a12b026703a9bd8eb9848d08c9d921434154534b59");
const AMOUNT_IN = 1_000_000n;
     
async function main() {
  console.log("🔗 Connecting to Blockfrost...");
  const lucid = await Lucid.new(
    new Blockfrost("https://cardano-mainnet.blockfrost.io/api/v0", BF_PROJECT_ID),
    "Mainnet"
  );
  await lucid.selectWalletFromSeed(MNEMONIC.trim());
  const sender = await lucid.wallet.address();

  console.log("📦 Gathering ADA-only UTxOs...");
  const all = await lucid.wallet.getUtxos();
  const utxos = all.filter(u => Object.keys(u.assets).length === 1 && u.assets.lovelace);
  
  console.log("🧰 Loading Minswap adapter...");
  const adapter = new BlockfrostAdapter(NetworkId.MAINNET, new BlockFrostAPI({
    projectId: BF_PROJECT_ID, network: "mainnet"
  }));
    
  console.log("🔎 Searching for V2 pool...");
  let pool = await adapter.getV2PoolByPair(ADA, CATSKY) ||
             await adapter.getV2PoolByPair(CATSKY, ADA);
  if (!pool) throw new Error("❌ ADA↔CATSKY V2 pool not found");
    
  const adaIsA = pool.assetA.policyId === "" && pool.assetA.assetName === "";
  const direction = adaIsA ? OrderV2.Direction.A_TO_B : OrderV2.Direction.B_TO_A;

const rawOut = DexV2Calculation.calculateAmountOut({
  reserveIn: adaIsA ? pool.reserveA : pool.reserveB,
  reserveOut: adaIsA ? pool.reserveB : pool.reserveA,
  amountIn: AMOUNT_IN,
  tradingFeeNumerator: adaIsA ? pool.feeA[0] : pool.feeB[0],
});

if (rawOut === 0n) throw new Error("❌ Pool reserves too low");

const minimumAmountOut = calculateAmountWithSlippageTolerance({
  slippageTolerancePercent: SLIPPAGE_PCT,
  amount: rawOut,
  type: "down",
});

// Now, you can use minimumAmountOut below
console.log(`Expect ~${rawOut} tokens (min ${minimumAmountOut})`);

// Now, you can use minimumAmountOut below
console.log(`Expect ~${rawOut} tokens (min ${minimumAmountOut})`);
  
  const minimumOut = calculateAmountWithSlippageTolerance({
    slippageTolerancePercent: SLIPPAGE_PCT,
    amount: rawOut,
    type: "down",
  });

  // CHANGE ONLY THIS LINE:
  console.log(`Expect ~${rawOut} tokens (min ${minimumOut})`);

console.log("🔥 Building swap transaction...");

const tx = await new DexV2(lucid, adapter).createBulkOrdersTx({
  sender,
  availableUtxos: utxos,
  orderOptions: [{
    type: OrderV2.StepType.SWAP_EXACT_IN,
    amountIn: AMOUNT_IN,
    assetIn: ADA,
    direction,
    minimumAmountOut,
    lpAsset: pool.lpAsset,
    isLimitOrder: false,
    killOnFailed: false,
    // omit `datum:` here
  }],
});

console.log("🖊 Signing & submitting...");
const txHash = await tx.sign().complete().then(c => c.submit());
console.log("🎉 Success! TX hash:", txHash);

} // <--- End of main function
    
main().catch(err => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
