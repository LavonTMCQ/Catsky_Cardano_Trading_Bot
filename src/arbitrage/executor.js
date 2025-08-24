// Arbitrage Execution Bot - Automatically executes profitable arbitrage trades
import { NetworkId, Asset, calculateSwapExactIn } from "@minswap/sdk";
import { Lucid, Blockfrost, fromText, toHex } from "lucid-cardano";
import { UnifiedDEXInterface } from "../dex/unified-dex-interface.js";
import { JSONDatabase } from "../utils/json-database.js";
import { CONFIG } from "../config/index.js";

export class ArbitrageExecutor {
  constructor() {
    this.dexInterface = null;
    this.database = new JSONDatabase();
    this.lucid = null;
    this.walletAddress = null;
    this.isExecuting = false;
    this.executionCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.totalProfitADA = 0;
    this.dryRun = process.env.DRY_RUN === 'true';
    
    console.log(`🤖 Arbitrage Executor initialized (${this.dryRun ? 'DRY RUN' : 'LIVE'} mode)`);
  }

  /**
   * Initialize the arbitrage executor
   */
  async initialize() {
    try {
      console.log("🔧 Initializing Arbitrage Executor...");
      
      // Initialize database
      await this.database.initialize();
      
      // Initialize DEX interface
      this.dexInterface = new UnifiedDEXInterface(NetworkId.MAINNET, CONFIG.BF_PROJECT_ID);
      await this.dexInterface.initialize();
      
      // Initialize Lucid wallet
      await this.initializeLucidWallet();
      
      console.log("✅ Arbitrage Executor initialized successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize Arbitrage Executor:", error);
      throw error;
    }
  }

  /**
   * Initialize Lucid wallet for transaction signing
   * @private
   */
  async initializeLucidWallet() {
    try {
      if (this.dryRun) {
        console.log("🏃 Dry run mode - skipping wallet initialization");
        return;
      }

      // Initialize Lucid with Blockfrost
      this.lucid = await Lucid.new(
        new Blockfrost(
          `https://cardano-${CONFIG.NETWORK}.blockfrost.io/api/v0`,
          CONFIG.BF_PROJECT_ID
        ),
        CONFIG.NETWORK
      );

      // Load wallet from mnemonic
      this.lucid.selectWalletFromSeed(CONFIG.MNEMONIC);
      this.walletAddress = await this.lucid.wallet.address();
      
      console.log(`💰 Wallet initialized: ${this.walletAddress.slice(0, 20)}...`);
      
      // Check wallet balance
      const utxos = await this.lucid.wallet.getUtxos();
      const totalADA = utxos.reduce((sum, utxo) => {
        return sum + Number(utxo.assets.lovelace || 0);
      }, 0) / 1_000_000;
      
      console.log(`💵 Wallet balance: ${totalADA.toFixed(2)} ADA`);
      
      if (totalADA < 5) {
        console.warn("⚠️ Low wallet balance! Consider funding wallet before running executor");
      }
      
    } catch (error) {
      console.error("❌ Failed to initialize Lucid wallet:", error);
      throw error;
    }
  }

  /**
   * Execute an arbitrage opportunity
   * @param {Object} opportunity - Arbitrage opportunity data
   * @returns {Promise<Object|null>} - Execution result
   */
  async executeArbitrage(opportunity) {
    if (this.isExecuting) {
      console.log("⏳ Another arbitrage is already executing, skipping...");
      return null;
    }

    this.isExecuting = true;
    const startTime = Date.now();
    let executionResult = null;

    try {
      console.log(`\\n🚀 EXECUTING ARBITRAGE: ${opportunity.pair}`);
      console.log(`   Buy: ${opportunity.buyDEX} @ ${opportunity.buyPrice.toFixed(6)}`);
      console.log(`   Sell: ${opportunity.sellDEX} @ ${opportunity.sellPrice.toFixed(6)}`);
      console.log(`   Expected Profit: ${opportunity.netProfitPercent.toFixed(2)}% (${opportunity.estimatedProfitADA.toFixed(3)} ADA)`);
      
      if (this.dryRun) {
        console.log("🏃 DRY RUN: Simulating arbitrage execution...");
        await this.simulateExecution(opportunity);
        executionResult = this.createExecutionResult(opportunity, true, "DRY_RUN_SUCCESS", 0, 0);
      } else {
        executionResult = await this.performRealExecution(opportunity);
      }

      // Update statistics
      this.executionCount++;
      if (executionResult.success) {
        this.successCount++;
        this.totalProfitADA += executionResult.actualProfitADA || 0;
      } else {
        this.failureCount++;
      }

      // Store execution record
      const executionRecord = {
        ...executionResult,
        opportunity: opportunity,
        executedAt: Date.now(),
        executionTime: Date.now() - startTime
      };
      
      await this.database.insert('arbitrage_executions', executionRecord);
      
      const duration = Date.now() - startTime;
      const status = executionResult.success ? "✅ SUCCESS" : "❌ FAILED";
      console.log(`${status}: Arbitrage execution completed in ${duration}ms`);
      
      return executionResult;
      
    } catch (error) {
      console.error("❌ Error executing arbitrage:", error);
      this.failureCount++;
      
      executionResult = this.createExecutionResult(
        opportunity, 
        false, 
        error.message, 
        0, 
        0
      );
      
      return executionResult;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Perform real arbitrage execution with blockchain transactions
   * @param {Object} opportunity 
   * @returns {Promise<Object>}
   * @private
   */
  async performRealExecution(opportunity) {
    try {
      const amountIn = BigInt(opportunity.amountIn);
      
      // Step 1: Execute buy trade (get tokens at lower price)
      console.log(`📥 Step 1: Buying tokens on ${opportunity.buyDEX}...`);
      const buyResult = await this.executeTrade(
        opportunity.buyDEX,
        Asset.fromString("lovelace"), // ADA
        Asset.fromString(opportunity.assetInfo.fullUnit), // Target token
        amountIn,
        opportunity.buyPool
      );
      
      if (!buyResult.success) {
        throw new Error(`Buy trade failed: ${buyResult.error}`);
      }
      
      const tokensReceived = buyResult.outputAmount;
      console.log(`✅ Buy successful: Received ${tokensReceived} tokens`);
      
      // Wait for buy transaction to confirm
      await this.waitForConfirmation(buyResult.txHash, 60000); // 60 second timeout
      
      // Step 2: Execute sell trade (sell tokens at higher price)
      console.log(`📤 Step 2: Selling tokens on ${opportunity.sellDEX}...`);
      const sellResult = await this.executeTrade(
        opportunity.sellDEX,
        Asset.fromString(opportunity.assetInfo.fullUnit), // Target token
        Asset.fromString("lovelace"), // ADA
        tokensReceived,
        opportunity.sellPool
      );
      
      if (!sellResult.success) {
        console.warn("⚠️ Sell trade failed - tokens may be stuck!");
        throw new Error(`Sell trade failed: ${sellResult.error}`);
      }
      
      const adaReceived = sellResult.outputAmount;
      console.log(`✅ Sell successful: Received ${adaReceived} lovelace`);
      
      // Calculate actual profit
      const actualProfitLovelace = Number(adaReceived) - Number(amountIn);
      const actualProfitADA = actualProfitLovelace / 1_000_000;
      const actualProfitPercent = (actualProfitLovelace / Number(amountIn)) * 100;
      
      console.log(`💰 ACTUAL PROFIT: ${actualProfitADA.toFixed(3)} ADA (${actualProfitPercent.toFixed(2)}%)`);
      
      return this.createExecutionResult(
        opportunity,
        true,
        "EXECUTION_COMPLETED",
        actualProfitADA,
        actualProfitPercent,
        {
          buyTxHash: buyResult.txHash,
          sellTxHash: sellResult.txHash,
          tokensReceived: tokensReceived.toString(),
          adaReceived: adaReceived.toString()
        }
      );
      
    } catch (error) {
      console.error("❌ Real execution error:", error);
      return this.createExecutionResult(opportunity, false, error.message, 0, 0);
    }
  }

  /**
   * Execute a single trade on a DEX
   * @param {string} dexName 
   * @param {Asset} assetIn 
   * @param {Asset} assetOut 
   * @param {bigint} amountIn 
   * @param {Object} pool 
   * @returns {Promise<Object>}
   * @private
   */
  async executeTrade(dexName, assetIn, assetOut, amountIn, pool) {
    try {
      const adapter = this.dexInterface.getDEXAdapter(dexName);
      
      // Calculate expected output
      const expectedOutput = await adapter.calculateSwapOutput(assetIn, assetOut, amountIn);
      
      // Build and submit swap transaction
      const swapResult = await adapter.executeSwap(
        assetIn,
        assetOut,
        amountIn,
        expectedOutput,
        this.walletAddress,
        this.lucid
      );
      
      return {
        success: true,
        txHash: swapResult.txHash,
        outputAmount: expectedOutput,
        dex: dexName
      };
      
    } catch (error) {
      console.error(`❌ Trade execution failed on ${dexName}:`, error);
      return {
        success: false,
        error: error.message,
        dex: dexName
      };
    }
  }

  /**
   * Wait for transaction confirmation
   * @param {string} txHash 
   * @param {number} timeoutMs 
   * @returns {Promise<boolean>}
   * @private
   */
  async waitForConfirmation(txHash, timeoutMs = 120000) {
    console.log(`⏳ Waiting for confirmation: ${txHash}`);
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const tx = await this.lucid.provider.getTransaction(txHash);
        if (tx) {
          console.log(`✅ Transaction confirmed: ${txHash}`);
          return true;
        }
      } catch (error) {
        // Transaction not found yet, continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
    
    throw new Error(`Transaction confirmation timeout: ${txHash}`);
  }

  /**
   * Simulate arbitrage execution for dry run testing
   * @param {Object} opportunity 
   * @private
   */
  async simulateExecution(opportunity) {
    console.log("📥 Simulating buy trade...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("✅ Buy simulation complete");
    
    console.log("📤 Simulating sell trade...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("✅ Sell simulation complete");
    
    console.log(`💰 SIMULATED PROFIT: ${opportunity.estimatedProfitADA.toFixed(3)} ADA (${opportunity.netProfitPercent.toFixed(2)}%)`);
  }

  /**
   * Create standardized execution result
   * @param {Object} opportunity 
   * @param {boolean} success 
   * @param {string} message 
   * @param {number} actualProfitADA 
   * @param {number} actualProfitPercent 
   * @param {Object} transactionData 
   * @returns {Object}
   * @private
   */
  createExecutionResult(opportunity, success, message, actualProfitADA, actualProfitPercent, transactionData = null) {
    return {
      success,
      message,
      pair: opportunity.pair,
      buyDEX: opportunity.buyDEX,
      sellDEX: opportunity.sellDEX,
      expectedProfitADA: opportunity.estimatedProfitADA,
      expectedProfitPercent: opportunity.netProfitPercent,
      actualProfitADA,
      actualProfitPercent,
      amountTraded: opportunity.amountIn,
      executionMode: this.dryRun ? 'DRY_RUN' : 'LIVE',
      transactionData
    };
  }

  /**
   * Check if an opportunity is still valid before execution
   * @param {Object} opportunity 
   * @returns {Promise<boolean>}
   */
  async validateOpportunity(opportunity) {
    try {
      // Re-fetch current prices to ensure opportunity is still valid
      const currentPrices = await this.dexInterface.getAllPrices(
        Asset.fromString("lovelace"),
        Asset.fromString(opportunity.assetInfo.fullUnit)
      );
      
      if (currentPrices.length < 2) {
        console.log("⚠️ Opportunity validation failed: Not enough DEXs available");
        return false;
      }
      
      const buyDEXPrice = currentPrices.find(p => p.dex === opportunity.buyDEX);
      const sellDEXPrice = currentPrices.find(p => p.dex === opportunity.sellDEX);
      
      if (!buyDEXPrice || !sellDEXPrice) {
        console.log("⚠️ Opportunity validation failed: DEX prices not available");
        return false;
      }
      
      // Check if price difference still exists
      const currentPriceDiff = sellDEXPrice.price - buyDEXPrice.price;
      const currentProfitPercent = (currentPriceDiff / buyDEXPrice.price) * 100;
      
      // Allow for some price movement but ensure still profitable
      const minProfitThreshold = CONFIG.ARBITRAGE_PROFIT_THRESHOLD * 0.8; // 80% of original threshold
      
      if (currentProfitPercent < minProfitThreshold) {
        console.log(`⚠️ Opportunity no longer profitable: ${currentProfitPercent.toFixed(2)}% < ${minProfitThreshold.toFixed(2)}%`);
        return false;
      }
      
      console.log(`✅ Opportunity still valid: ${currentProfitPercent.toFixed(2)}% profit`);
      return true;
      
    } catch (error) {
      console.error("❌ Error validating opportunity:", error);
      return false;
    }
  }

  /**
   * Get recent execution history
   * @param {number} limit 
   */
  async getExecutionHistory(limit = 20) {
    return await this.database.select('arbitrage_executions', null, limit);
  }

  /**
   * Get execution statistics
   */
  getExecutionStats() {
    return {
      executionCount: this.executionCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      successRate: this.executionCount > 0 ? (this.successCount / this.executionCount) * 100 : 0,
      totalProfitADA: this.totalProfitADA,
      averageProfitADA: this.successCount > 0 ? this.totalProfitADA / this.successCount : 0,
      isExecuting: this.isExecuting,
      executionMode: this.dryRun ? 'DRY_RUN' : 'LIVE'
    };
  }

  /**
   * Emergency stop execution
   */
  emergencyStop() {
    console.log("🚨 EMERGENCY STOP ACTIVATED");
    this.isExecuting = false;
    // Additional cleanup if needed
  }
}

// CLI functionality if run directly
async function main() {
  const executor = new ArbitrageExecutor();
  
  try {
    await executor.initialize();
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
      case 'test':
        // Test execution with a mock opportunity
        const mockOpportunity = {
          pair: "ADA/CATSKY",
          buyDEX: "Minswap",
          sellDEX: "SundaeSwap",
          buyPrice: 4.0,
          sellPrice: 4.2,
          netProfitPercent: 3.5,
          estimatedProfitADA: 0.35,
          amountIn: "1000000",
          assetInfo: { fullUnit: "9b426921a21f54600711da0be1a12b026703a9bd8eb9848d08c9d921434154534b59" }
        };
        
        await executor.executeArbitrage(mockOpportunity);
        process.exit(0);
        break;
        
      case 'stats':
        const stats = executor.getExecutionStats();
        const history = await executor.getExecutionHistory(5);
        console.log("📊 Arbitrage Executor Statistics:");
        console.log(JSON.stringify({ stats, recentExecutions: history }, null, 2));
        process.exit(0);
        break;
        
      default:
        console.log("Usage:");
        console.log("  node src/arbitrage/executor.js test   - Test execution with mock data");
        console.log("  node src/arbitrage/executor.js stats  - Show execution statistics");
        process.exit(1);
    }
    
  } catch (error) {
    console.error("❌ Arbitrage Executor failed:", error);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default ArbitrageExecutor;