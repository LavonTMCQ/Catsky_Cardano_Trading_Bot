// Real-time Price Monitoring System
import cron from 'node-cron';
import { NetworkId, Asset } from "@minswap/sdk";
import { UnifiedDEXInterface } from "./dex/unified-dex-interface.js";
import { JSONDatabase } from "./utils/json-database.js";
import { CONFIG } from "./config/index.js";

export class PriceMonitor {
  constructor() {
    this.dexInterface = null;
    this.database = new JSONDatabase();
    this.isRunning = false;
    this.cronJob = null;
    this.lastUpdateTime = null;
    this.updateCount = 0;
    
    // Define the token pairs to monitor
    this.tokenPairs = this._getTokenPairs();
    
    console.log(`📊 Price Monitor initialized for ${this.tokenPairs.length} token pairs`);
  }

  /**
   * Initialize the price monitoring system
   */
  async initialize() {
    try {
      console.log("🔧 Initializing Price Monitor...");
      
      // Initialize database
      await this.database.initialize();
      
      // Initialize DEX interface
      this.dexInterface = new UnifiedDEXInterface(NetworkId.MAINNET, CONFIG.BF_PROJECT_ID);
      await this.dexInterface.initialize();
      
      console.log("✅ Price Monitor initialized successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize Price Monitor:", error);
      throw error;
    }
  }

  /**
   * Start the price monitoring with cron schedule
   * @param {string} schedule - Cron schedule (default: every 30 seconds)
   */
  start(schedule = '*/30 * * * * *') { // Every 30 seconds
    if (this.isRunning) {
      console.log("⚠️ Price Monitor is already running");
      return;
    }

    console.log(`🚀 Starting Price Monitor with schedule: ${schedule}`);
    
    // Run immediately first
    this.updatePrices();
    
    // Schedule recurring updates
    this.cronJob = cron.schedule(schedule, () => {
      this.updatePrices();
    }, {
      scheduled: false
    });
    
    this.cronJob.start();
    this.isRunning = true;
    
    console.log("✅ Price Monitor started");
  }

  /**
   * Stop the price monitoring
   */
  stop() {
    if (!this.isRunning) {
      console.log("⚠️ Price Monitor is not running");
      return;
    }

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    
    this.isRunning = false;
    console.log("🛑 Price Monitor stopped");
  }

  /**
   * Update prices for all monitored token pairs
   */
  async updatePrices() {
    try {
      const startTime = Date.now();
      console.log(`\n🔄 Updating prices... (Update #${this.updateCount + 1})`);
      
      const allPriceData = [];
      
      for (const pair of this.tokenPairs) {
        try {
          const prices = await this.dexInterface.getAllPrices(pair.assetA, pair.assetB);
          
          for (const priceData of prices) {
            const record = {
              pair: pair.symbol,
              assetA: pair.assetA.toString(),
              assetB: pair.assetB.toString(), 
              dex: priceData.dex,
              price: priceData.price,
              reserveA: priceData.reserves.reserveA.toString(),
              reserveB: priceData.reserves.reserveB.toString(),
              volume24h: null, // Would need to calculate from historical data
              change24h: null  // Would need to calculate from historical data
            };
            
            allPriceData.push(record);
          }
          
          console.log(`  ${pair.symbol}: Found ${prices.length} price(s)`);
          
        } catch (error) {
          console.log(`  ${pair.symbol}: No price data (${error.message})`);
        }
      }
      
      // Store all price data
      if (allPriceData.length > 0) {
        await this.database.insertMany('price_history', allPriceData);
        console.log(`💾 Stored ${allPriceData.length} price records`);
      }
      
      // Update statistics
      this.lastUpdateTime = Date.now();
      this.updateCount++;
      
      const duration = Date.now() - startTime;
      console.log(`✅ Price update completed in ${duration}ms`);
      
      // Clean old data (keep last 7 days)
      if (this.updateCount % 100 === 0) { // Clean every 100 updates
        await this.database.deleteOlderThan('price_history');
      }
      
    } catch (error) {
      console.error("❌ Error updating prices:", error);
    }
  }

  /**
   * Get latest prices for a specific token pair
   * @param {string} pairSymbol - Token pair symbol (e.g., 'ADA/CATSKY')
   * @param {number} limit - Number of latest records to return
   */
  async getLatestPrices(pairSymbol, limit = 10) {
    return await this.database.select('price_history', 
      record => record.pair === pairSymbol, 
      limit
    );
  }

  /**
   * Get price history for a time range
   * @param {string} pairSymbol - Token pair symbol
   * @param {number} startTime - Start timestamp
   * @param {number} endTime - End timestamp
   */
  async getPriceHistory(pairSymbol, startTime, endTime = Date.now()) {
    const allData = await this.database.selectByTimeRange('price_history', startTime, endTime);
    return allData.filter(record => record.pair === pairSymbol);
  }

  /**
   * Get current best prices across all DEXs for a pair
   * @param {string} pairSymbol - Token pair symbol
   */
  async getCurrentBestPrices(pairSymbol) {
    const latestPrices = await this.getLatestPrices(pairSymbol, 50);
    
    if (latestPrices.length === 0) {
      return null;
    }

    // Group by DEX and get latest price for each
    const dexPrices = {};
    for (const record of latestPrices) {
      if (!dexPrices[record.dex] || record.timestamp > dexPrices[record.dex].timestamp) {
        dexPrices[record.dex] = record;
      }
    }

    const prices = Object.values(dexPrices);
    
    const bestBuy = prices.reduce((best, current) => 
      current.price < best.price ? current : best
    );
    
    const bestSell = prices.reduce((best, current) => 
      current.price > best.price ? current : best
    );

    return {
      bestBuy,
      bestSell,
      spread: bestSell.price - bestBuy.price,
      spreadPercent: ((bestSell.price - bestBuy.price) / bestBuy.price) * 100,
      allPrices: prices
    };
  }

  /**
   * Get monitoring statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      updateCount: this.updateCount,
      lastUpdateTime: this.lastUpdateTime,
      monitoredPairs: this.tokenPairs.length,
      nextUpdate: this.cronJob ? 'Scheduled' : 'Not scheduled',
      uptime: this.lastUpdateTime ? Date.now() - this.lastUpdateTime : 0
    };
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats() {
    return await this.database.getAllStats();
  }

  /**
   * Manual price update (useful for testing)
   */
  async manualUpdate() {
    console.log("🔧 Manual price update requested");
    await this.updatePrices();
  }

  /**
   * Check for emergency stop
   * @private
   */
  async _checkEmergencyStop() {
    try {
      await fs.access(CONFIG.EMERGENCY_STOP_FILE);
      console.log("🚨 Emergency stop file detected - stopping price monitor");
      this.stop();
      return true;
    } catch {
      return false; // File doesn't exist, continue normally
    }
  }

  /**
   * Define the token pairs to monitor
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
  const monitor = new PriceMonitor();
  
  try {
    await monitor.initialize();
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
      case 'start':
        monitor.start();
        console.log("Press Ctrl+C to stop");
        process.on('SIGINT', () => {
          console.log("\n🛑 Stopping Price Monitor...");
          monitor.stop();
          process.exit(0);
        });
        break;
        
      case 'update':
        await monitor.manualUpdate();
        process.exit(0);
        break;
        
      case 'stats':
        const stats = monitor.getStats();
        const dbStats = await monitor.getDatabaseStats();
        console.log("📊 Price Monitor Statistics:");
        console.log(JSON.stringify({ monitor: stats, database: dbStats }, null, 2));
        process.exit(0);
        break;
        
      case 'prices':
        const pair = args[1] || 'ADA/CATSKY';
        const latest = await monitor.getLatestPrices(pair, 5);
        console.log(`💰 Latest prices for ${pair}:`);
        console.log(JSON.stringify(latest, null, 2));
        process.exit(0);
        break;
        
      default:
        console.log("Usage:");
        console.log("  npm run price-monitor start   - Start monitoring");
        console.log("  npm run price-monitor update  - Manual update");
        console.log("  npm run price-monitor stats   - Show statistics");
        console.log("  npm run price-monitor prices [pair] - Show latest prices");
        process.exit(1);
    }
    
  } catch (error) {
    console.error("❌ Price Monitor failed:", error);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default PriceMonitor;