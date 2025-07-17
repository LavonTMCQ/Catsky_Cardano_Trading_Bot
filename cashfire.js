//swap2.js — 1 ADA ➜ CATSKY (Mainnet)

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
  OrderV2,
  getBackendBlockfrostLucidInstance,
} from "@minswap/sdk";
import { BlockFrostAPI } from "@blockfrost/blockfrost-js";

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
  const sender = "addr1qx492sqgzk5c7jljapc4kq3jmf29pqz5v39h00dq4wvtszczq5gfxkek2fxdwevtjcjaf8hdap97auc744p8ppjf4vns394f0k";

  const lucid = await getBackendBlockfrostLucidInstance(
    NetworkId.MAINNET,
    BF_PROJECT_ID,
    "https://cardano-mainnet.blockfrost.io/api/v0",
    sender
  );
  await lucid.selectWalletFromSeed(MNEMONIC.trim());

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
console.log("POOL DEBUG →", {
  found : !!pool,
  id    : pool?.id,
  assetA: pool?.assetA?.policyId || "ADA",
  assetB: pool?.assetB?.policyId || "ADA",
  reserves: pool ? {
    reserveA: pool.reserveA.toString(),
    reserveB: pool.reserveB.toString()
  } : "N/A"
});

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

  console.log(`Expect ~${rawOut} tokens (min ${minimumAmountOut})`);

  console.log("🔥 Building swap transaction...");

  const txComplete = await new DexV2(lucid, adapter).createBulkOrdersTx({
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
      killOnFailed: true,
      slippageTolerancePercent: 2
      // omit `datum:` here
    }],
  });

  console.log("🖊 Signing & submitting...");
  const signedTx = txComplete.sign();
  const completedTx = await signedTx.commit();
  const txHash = await completedTx.submit();
  console.log("🎉 Success! TX hash:", txHash);

} // <--- End of main function
    
main().catch(err => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
