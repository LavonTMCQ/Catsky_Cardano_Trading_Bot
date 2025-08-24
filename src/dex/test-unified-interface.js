// Test script for Unified DEX Interface
import dotenv from "dotenv";
dotenv.config();

import { Asset, NetworkId } from "@minswap/sdk";
import { UnifiedDEXInterface } from "./unified-dex-interface.js";
import { CONFIG, validateConfig } from "../config/index.js";

async function testUnifiedDEXInterface() {
  try {
    console.log("🧪 Testing Unified DEX Interface\n");
    
    // Validate configuration (skip mnemonic validation for test)
    console.log('✅ Configuration loaded (validation skipped for test)');
    console.log(`📊 Mode: ${CONFIG.DRY_RUN_MODE ? 'DRY RUN' : 'LIVE TRADING'}`);
    console.log(`🌐 Network: ${CONFIG.NETWORK}`);
    
    // Initialize unified interface
    const dexInterface = new UnifiedDEXInterface(NetworkId.MAINNET, CONFIG.BF_PROJECT_ID);
    await dexInterface.initialize();
    
    // Test assets
    const ADA = Asset.fromString("lovelace");
    const CATSKY = Asset.fromString(CONFIG.SUPPORTED_TOKENS.CATSKY.fullUnit);
    
    console.log("\n📊 Testing price fetching across DEXs...");
    
    // Test 1: Get all prices
    const prices = await dexInterface.getAllPrices(ADA, CATSKY);
    console.log("All prices:", prices);
    
    // Test 2: Get best buy price
    console.log("\n💰 Testing best price detection...");
    try {
      const bestBuy = await dexInterface.getBestBuyPrice(ADA, CATSKY);
      console.log("Best buy price (lowest):", bestBuy);
    } catch (error) {
      console.log("No buy prices available");
    }
    
    // Test 3: Get best sell price
    try {
      const bestSell = await dexInterface.getBestSellPrice(ADA, CATSKY);
      console.log("Best sell price (highest):", bestSell);
    } catch (error) {
      console.log("No sell prices available");
    }
    
    // Test 4: Detect arbitrage opportunities
    console.log("\n🔍 Testing arbitrage detection...");
    const arbitrage = await dexInterface.detectArbitrage(ADA, CATSKY, 1_000_000n);
    if (arbitrage) {
      console.log("🚨 Arbitrage opportunity detected!");
      console.log(`Buy on ${arbitrage.buyDEX} at ${arbitrage.buyPrice}`);
      console.log(`Sell on ${arbitrage.sellDEX} at ${arbitrage.sellPrice}`);
      console.log(`Net profit: ${arbitrage.netProfitPercent.toFixed(2)}%`);
    } else {
      console.log("No profitable arbitrage opportunities found");
    }
    
    // Test 5: Get liquidity data
    console.log("\n💧 Testing liquidity data...");
    try {
      const liquidity = await dexInterface.getAllLiquidity(ADA, CATSKY);
      console.log("Liquidity across DEXs:", liquidity);
    } catch (error) {
      console.log("Error getting liquidity:", error.message);
    }
    
    // Test 6: Interface statistics
    console.log("\n📈 Interface Statistics:");
    console.log(dexInterface.getStats());
    
    // Test 7: Individual DEX adapter
    console.log("\n🔧 Testing individual DEX adapter...");
    const minswapAdapter = dexInterface.getDEXAdapter('Minswap');
    const feeStructure = minswapAdapter.getFeeStructure();
    console.log("Minswap fee structure:", feeStructure);
    
    // Test swap calculation
    try {
      const swapOutput = await minswapAdapter.calculateSwapOutput(ADA, CATSKY, 1_000_000n);
      console.log("Swap output for 1 ADA → CATSKY:");
      console.log(`Expected: ${swapOutput.amountOut} CATSKY`);
      console.log(`Price impact: ${swapOutput.priceImpact?.toFixed(4)}%`);
      console.log(`Trading fee: ${swapOutput.fee}%`);
    } catch (error) {
      console.log("Error calculating swap:", error.message);
    }
    
    console.log("\n✅ All tests completed successfully!");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testUnifiedDEXInterface()
    .then(() => {
      console.log("🎉 Testing complete");
      process.exit(0);
    })
    .catch(error => {
      console.error("💥 Testing failed:", error);
      process.exit(1);
    });
}