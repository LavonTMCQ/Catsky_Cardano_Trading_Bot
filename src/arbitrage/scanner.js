// Arbitrage Scanner - Detects profitable opportunities across DEXs
import cron from 'node-cron';
import { NetworkId, Asset } from "@minswap/sdk";
import { UnifiedDEXInterface } from "../dex/unified-dex-interface.js";
import { JSONDatabase } from "../utils/json-database.js";
import { CONFIG } from "../config/index.js";

export class ArbitrageScanner {
  constructor() {
    this.dexInterface = null;
    this.database = new JSONDatabase();
    this.isRunning = false;
    this.cronJob = null;
    this.lastScanTime = null;
    this.scanCount = 0;
    this.opportunitiesFound = 0;
    
    // Define the token pairs to scan for arbitrage
    this.tokenPairs = this._getTokenPairs();
    
    console.log(`🔍 Arbitrage Scanner initialized for ${this.tokenPairs.length} token pairs`);
  }

  /**
   * Initialize the arbitrage scanner
   */
  async initialize() {
    try {
      console.log("🔧 Initializing Arbitrage Scanner...");
      
      // Initialize database
      await this.database.initialize();
      
      // Initialize DEX interface
      this.dexInterface = new UnifiedDEXInterface(NetworkId.MAINNET, CONFIG.BF_PROJECT_ID);
      await this.dexInterface.initialize();
      
      console.log("✅ Arbitrage Scanner initialized successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize Arbitrage Scanner:", error);
      throw error;
    }
  }

  /**
   * Start the arbitrage scanning with cron schedule
   * @param {string} schedule - Cron schedule (default: every 30 seconds)
   */
  start(schedule = '*/30 * * * * *') { // Every 30 seconds
    if (this.isRunning) {
      console.log("⚠️ Arbitrage Scanner is already running");
      return;
    }

    console.log(`🚀 Starting Arbitrage Scanner with schedule: ${schedule}`);
    
    // Run immediately first
    this.scanForArbitrage();
    
    // Schedule recurring scans
    this.cronJob = cron.schedule(schedule, () => {
      this.scanForArbitrage();
    }, {
      scheduled: false
    });
    
    this.cronJob.start();
    this.isRunning = true;
    
    console.log("✅ Arbitrage Scanner started");
  }

  /**
   * Stop the arbitrage scanning
   */
  stop() {
    if (!this.isRunning) {
      console.log("⚠️ Arbitrage Scanner is not running");
      return;
    }

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    
    this.isRunning = false;
    console.log("🛑 Arbitrage Scanner stopped");
  }

  /**
   * Scan for arbitrage opportunities across all token pairs
   */
  async scanForArbitrage() {
    try {
      const startTime = Date.now();
      console.log(`\n🔍 Scanning for arbitrage opportunities... (Scan #${this.scanCount + 1})`);
      
      const opportunities = [];
      
      for (const pair of this.tokenPairs) {
        try {
          const opportunity = await this.detectArbitrageForPair(
            pair.assetA, 
            pair.assetB, 
            CONFIG.DEFAULT_SWAP_AMOUNT
          );
          
          if (opportunity) {
            opportunities.push({
              ...opportunity,
              pair: pair.symbol,
              assetInfo: pair.tokenInfo
            });
            
            console.log(`🚨 ARBITRAGE FOUND: ${pair.symbol}`);
            console.log(`   Buy: ${opportunity.buyDEX} @ ${opportunity.buyPrice.toFixed(6)}`);
            console.log(`   Sell: ${opportunity.sellDEX} @ ${opportunity.sellPrice.toFixed(6)}`);
            console.log(`   Profit: ${opportunity.netProfitPercent.toFixed(2)}%`);
          } else {
            console.log(`   ${pair.symbol}: No profitable arbitrage`);
          }
          
        } catch (error) {
          console.log(`   ${pair.symbol}: Error - ${error.message}`);
        }
      }
      
      // Store opportunities in database
      if (opportunities.length > 0) {
        await this.database.insertMany('arbitrage_opportunities', opportunities);
        this.opportunitiesFound += opportunities.length;
        
        console.log(`💾 Stored ${opportunities.length} arbitrage opportunities`);
        
        // Send alerts for high-profit opportunities
        const highProfitOps = opportunities.filter(op => op.netProfitPercent > 5);
        if (highProfitOps.length > 0) {
          await this.sendHighProfitAlert(highProfitOps);
        }
      }
      
      // Update statistics
      this.lastScanTime = Date.now();
      this.scanCount++;
      
      const duration = Date.now() - startTime;
      console.log(`✅ Arbitrage scan completed in ${duration}ms`);
      console.log(`📊 Total found: ${opportunities.length} | Session total: ${this.opportunitiesFound}`);
      
      // Clean old opportunities (keep last 24 hours)
      if (this.scanCount % 50 === 0) { // Clean every 50 scans
        await this.database.deleteOlderThan('arbitrage_opportunities', 24 * 60 * 60 * 1000);
      }
      
    } catch (error) {
      console.error("❌ Error scanning for arbitrage:", error);
    }
  }

  /**
   * Detect arbitrage opportunity for a specific token pair
   * @param {Asset} assetA 
   * @param {Asset} assetB 
   * @param {bigint} amountIn 
   * @returns {Promise<Object|null>}
   */
  async detectArbitrageForPair(assetA, assetB, amountIn) {
    try {
      // Get prices from all DEXs
      const prices = await this.dexInterface.getAllPrices(assetA, assetB);
      
      if (prices.length < 2) {
        return null; // Need at least 2 DEXs for arbitrage
      }

      // Find highest and lowest prices
      const sortedPrices = prices.sort((a, b) => a.price - b.price);
      const lowestPrice = sortedPrices[0];
      const highestPrice = sortedPrices[sortedPrices.length - 1];

      if (lowestPrice.dex === highestPrice.dex) {
        return null; // Same DEX, no arbitrage possible
      }

      // Calculate basic price difference
      const priceDifference = highestPrice.price - lowestPrice.price;
      const percentDifference = (priceDifference / lowestPrice.price) * 100;

      // Get fee structures for both DEXs
      const buyDEXAdapter = this.dexInterface.getDEXAdapter(lowestPrice.dex);
      const sellDEXAdapter = this.dexInterface.getDEXAdapter(highestPrice.dex);
      
      const buyFees = buyDEXAdapter.getFeeStructure();
      const sellFees = sellDEXAdapter.getFeeStructure();

      // Calculate comprehensive costs
      const costs = this.calculateArbitrageCosts(
        Number(amountIn),
        lowestPrice.price,
        highestPrice.price,
        buyFees,
        sellFees
      );

      // Net profit calculation
      const netProfitPercent = percentDifference - costs.totalFeePercent - costs.slippagePercent;

      // Check if profitable after all costs
      if (netProfitPercent > CONFIG.ARBITRAGE_PROFIT_THRESHOLD) {
        return {
          profitable: true,
          buyDEX: lowestPrice.dex,
          sellDEX: highestPrice.dex,
          buyPrice: lowestPrice.price,
          sellPrice: highestPrice.price,
          priceDifference,
          percentDifference,
          netProfitPercent,
          estimatedProfitADA: costs.estimatedProfitADA,
          costs,
          amountIn: amountIn.toString(),
          timestamp: Date.now(),
          // Additional data for execution
          buyPool: lowestPrice.pool,
          sellPool: highestPrice.pool,
          allPrices: prices
        };
      }

      return null;
      
    } catch (error) {
      console.error("Error detecting arbitrage for pair:", error);
      return null;
    }
  }

  /**
   * Calculate comprehensive arbitrage costs
   * @param {number} amountInADA 
   * @param {number} buyPrice 
   * @param {number} sellPrice 
   * @param {Object} buyFees 
   * @param {Object} sellFees 
   * @returns {Object}
   */
  calculateArbitrageCosts(amountInADA, buyPrice, sellPrice, buyFees, sellFees) {
    // Convert to numbers for calculation
    const amountADA = amountInADA / 1_000_000; // Convert from lovelace
    
    // Trading fees
    const buyTradingFee = buyFees.tradingFee * 100; // Convert to percentage
    const sellTradingFee = sellFees.tradingFee * 100;
    
    // Network fees (in ADA)
    const buyNetworkFee = buyFees.networkFee || 0.3;
    const sellNetworkFee = sellFees.networkFee || 0.3;
    
    // Batcher fees (in ADA)
    const buyBatcherFee = buyFees.batcherFee || 0.7;
    const sellBatcherFee = sellFees.batcherFee || 0.7;
    
    // Slippage estimation (higher for larger trades)
    const estimatedSlippage = this.estimateSlippage(amountADA);
    
    // Calculate total costs
    const totalTradingFeePercent = buyTradingFee + sellTradingFee;
    const totalNetworkFeesADA = buyNetworkFee + sellNetworkFee;
    const totalBatcherFeesADA = buyBatcherFee + sellBatcherFee;
    const totalFixedFeesADA = totalNetworkFeesADA + totalBatcherFeesADA;
    
    // Convert fixed fees to percentage of trade amount
    const fixedFeesPercent = (totalFixedFeesADA / amountADA) * 100;
    
    const totalFeePercent = totalTradingFeePercent + fixedFeesPercent;
    const slippagePercent = estimatedSlippage;
    
    // Estimate profit calculation
    const tokensReceived = amountADA * buyPrice * (1 - totalTradingFeePercent / 100);
    const adaFromSale = tokensReceived * sellPrice * (1 - sellTradingFee / 100);
    const finalADA = adaFromSale - totalFixedFeesADA;
    const estimatedProfitADA = finalADA - amountADA;
    
    return {
      totalFeePercent,
      slippagePercent,
      estimatedProfitADA,
      breakdown: {
        buyTradingFee: `${buyTradingFee}%`,
        sellTradingFee: `${sellTradingFee}%`,
        totalTradingFees: `${totalTradingFeePercent}%`,
        networkFees: `${totalNetworkFeesADA} ADA`,
        batcherFees: `${totalBatcherFeesADA} ADA`,
        totalFixedFees: `${totalFixedFeesADA} ADA`,
        estimatedSlippage: `${estimatedSlippage}%`
      }
    };
  }

  /**
   * Estimate slippage based on trade size
   * @param {number} amountADA 
   * @returns {number} Slippage percentage
   */
  estimateSlippage(amountADA) {
    // Simple slippage model - larger trades have higher slippage
    if (amountADA < 10) return 0.1; // 0.1% for small trades
    if (amountADA < 100) return 0.3; // 0.3% for medium trades
    if (amountADA < 1000) return 0.7; // 0.7% for large trades
    return 1.5; // 1.5% for very large trades
  }

  /**
   * Send alert for high-profit opportunities
   * @param {Array} opportunities 
   */
  async sendHighProfitAlert(opportunities) {
    console.log("\n🚨 HIGH PROFIT ARBITRAGE ALERT!");
    console.log("=" .repeat(50));
    
    for (const op of opportunities) {
      console.log(`💰 ${op.pair}:`);
      console.log(`   Profit: ${op.netProfitPercent.toFixed(2)}%`);
      console.log(`   Buy: ${op.buyDEX} @ ${op.buyPrice.toFixed(6)}`);
      console.log(`   Sell: ${op.sellDEX} @ ${op.sellPrice.toFixed(6)}`);
      console.log(`   Estimated Profit: ${op.estimatedProfitADA.toFixed(3)} ADA`);
      console.log("");
    }
    
    console.log("=" .repeat(50));
    
    // Here you could add webhook notifications, email alerts, etc.
    // For now, just log to console and store in database
  }

  /**
   * Get recent arbitrage opportunities
   * @param {number} limit 
   */
  async getRecentOpportunities(limit = 10) {
    return await this.database.select('arbitrage_opportunities', null, limit);
  }

  /**
   * Get arbitrage statistics
   */
  async getStats() {
    const opportunities = await this.database.select('arbitrage_opportunities');
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;
    
    const hourlyOps = opportunities.filter(op => op.timestamp > now - oneHour);
    const dailyOps = opportunities.filter(op => op.timestamp > now - oneDay);
    
    return {
      scanner: {
        isRunning: this.isRunning,
        scanCount: this.scanCount,
        lastScanTime: this.lastScanTime,
        monitoredPairs: this.tokenPairs.length,
        opportunitiesFound: this.opportunitiesFound
      },
      opportunities: {
        total: opportunities.length,
        lastHour: hourlyOps.length,
        last24h: dailyOps.length,
        avgProfitPercent: opportunities.length > 0 
          ? opportunities.reduce((sum, op) => sum + op.netProfitPercent, 0) / opportunities.length 
          : 0,
        maxProfitPercent: opportunities.length > 0 
          ? Math.max(...opportunities.map(op => op.netProfitPercent)) 
          : 0
      }
    };
  }

  /**
   * Manual arbitrage scan
   */
  async manualScan() {
    console.log("🔧 Manual arbitrage scan requested");
    await this.scanForArbitrage();
  }

  /**
   * Define the token pairs to scan
   * @private
   */
  _getTokenPairs() {
    const ADA = Asset.fromString("lovelace");
    
    return Object.values(CONFIG.SUPPORTED_TOKENS).map(token => ({
      symbol: `ADA/${token.symbol}`,
      assetA: ADA,
      assetB: Asset.fromString(token.fullUnit),
      tokenInfo: token
    }));
  }
}

// CLI functionality if run directly
async function main() {
  const scanner = new ArbitrageScanner();
  
  try {
    await scanner.initialize();
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
      case 'start':
        scanner.start();
        console.log("Press Ctrl+C to stop");
        process.on('SIGINT', () => {
          console.log("\n🛑 Stopping Arbitrage Scanner...");
          scanner.stop();
          process.exit(0);
        });
        break;
        
      case 'scan':
        await scanner.manualScan();
        process.exit(0);
        break;
        
      case 'stats':
        const stats = await scanner.getStats();
        console.log("📊 Arbitrage Scanner Statistics:");
        console.log(JSON.stringify(stats, null, 2));
        process.exit(0);
        break;
        
      case 'opportunities':
        const limit = parseInt(args[1]) || 10;
        const opportunities = await scanner.getRecentOpportunities(limit);
        console.log(`💰 Recent ${limit} arbitrage opportunities:`);
        console.log(JSON.stringify(opportunities, null, 2));
        process.exit(0);
        break;
        
      default:
        console.log("Usage:");
        console.log("  npm run arbitrage start  - Start continuous scanning");
        console.log("  npm run arbitrage scan   - Manual scan");
        console.log("  npm run arbitrage stats  - Show statistics");
        console.log("  npm run arbitrage opportunities [limit] - Show recent opportunities");
        process.exit(1);
    }
    
  } catch (error) {
    console.error("❌ Arbitrage Scanner failed:", error);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default ArbitrageScanner;