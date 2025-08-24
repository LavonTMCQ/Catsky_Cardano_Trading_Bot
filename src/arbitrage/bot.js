// Autonomous Arbitrage Bot - Combines scanning and execution for fully automated arbitrage
import cron from 'node-cron';
import ArbitrageScanner from './scanner.js';
import ArbitrageExecutor from './executor.js';
import { CONFIG } from '../config/index.js';

export class ArbitrageBot {
  constructor(options = {}) {
    this.scanner = new ArbitrageScanner();
    this.executor = new ArbitrageExecutor();
    this.isRunning = false;
    this.cronJob = null;
    this.botStartTime = null;
    this.totalScans = 0;
    this.opportunitiesDetected = 0;
    this.arbitragesExecuted = 0;
    this.profitableExecutions = 0;
    this.totalProfitADA = 0;
    this.dryRun = process.env.DRY_RUN === 'true';
    
    // Configuration options
    this.config = {
      scanInterval: options.scanInterval || '*/30 * * * * *', // Every 30 seconds
      maxExecutionsPerHour: options.maxExecutionsPerHour || 10,
      minProfitThreshold: options.minProfitThreshold || CONFIG.ARBITRAGE_PROFIT_THRESHOLD,
      maxTradeAmount: options.maxTradeAmount || 10_000_000n, // 10 ADA max
      enableAutoExecution: options.enableAutoExecution !== false, // True by default
      emergencyStopFile: options.emergencyStopFile || './EMERGENCY_STOP',
      ...options
    };
    
    // Execution tracking for rate limiting
    this.executionHistory = [];
    
    console.log(`🤖 Arbitrage Bot initialized (${this.dryRun ? 'DRY RUN' : 'LIVE'} mode)`);
    console.log(`⚙️  Configuration:`);
    console.log(`   - Scan Interval: ${this.config.scanInterval}`);
    console.log(`   - Max Executions/Hour: ${this.config.maxExecutionsPerHour}`);
    console.log(`   - Min Profit Threshold: ${this.config.minProfitThreshold}%`);
    console.log(`   - Auto Execution: ${this.config.enableAutoExecution ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Initialize the arbitrage bot
   */
  async initialize() {
    try {
      console.log("🔧 Initializing Arbitrage Bot...");
      
      // Initialize scanner
      await this.scanner.initialize();
      
      // Initialize executor
      await this.executor.initialize();
      
      console.log("✅ Arbitrage Bot initialized successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize Arbitrage Bot:", error);
      throw error;
    }
  }

  /**
   * Start the autonomous arbitrage bot
   */
  start() {
    if (this.isRunning) {
      console.log("⚠️ Arbitrage Bot is already running");
      return;
    }

    console.log(`🚀 Starting Autonomous Arbitrage Bot...`);
    console.log(`📊 Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE TRADING'}`);
    
    // Run initial scan
    this.performArbitrageLoop();
    
    // Schedule recurring scans
    this.cronJob = cron.schedule(this.config.scanInterval, () => {
      this.performArbitrageLoop();
    }, {
      scheduled: false
    });
    
    this.cronJob.start();
    this.isRunning = true;
    this.botStartTime = Date.now();
    
    console.log("✅ Autonomous Arbitrage Bot started");
    console.log("🔍 Bot will scan for opportunities and execute automatically");
    
    if (!this.dryRun) {
      console.log("⚠️  LIVE MODE: Real ADA will be traded!");
    }
  }

  /**
   * Stop the arbitrage bot
   */
  stop() {
    if (!this.isRunning) {
      console.log("⚠️ Arbitrage Bot is not running");
      return;
    }

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    
    this.scanner.stop();
    this.isRunning = false;
    
    console.log("🛑 Autonomous Arbitrage Bot stopped");
    this.printSessionSummary();
  }

  /**
   * Main arbitrage loop - scan for opportunities and execute if profitable
   * @private
   */
  async performArbitrageLoop() {
    try {
      const loopStartTime = Date.now();
      console.log(`\\n🔄 Arbitrage Loop ${this.totalScans + 1} - ${new Date().toLocaleTimeString()}`);
      
      // Check for emergency stop
      if (await this.checkEmergencyStop()) {
        return;
      }
      
      // Scan for arbitrage opportunities
      const opportunities = await this.scanForOpportunities();
      this.totalScans++;
      
      if (opportunities.length === 0) {
        console.log("📊 No profitable opportunities found");
        return;
      }
      
      this.opportunitiesDetected += opportunities.length;
      console.log(`🎯 Found ${opportunities.length} profitable opportunities!`);
      
      // Execute opportunities if auto-execution is enabled
      if (this.config.enableAutoExecution) {
        for (const opportunity of opportunities) {
          const executed = await this.evaluateAndExecuteOpportunity(opportunity);
          if (executed) {
            this.arbitragesExecuted++;
            break; // Execute only one opportunity per loop to prevent overtrading
          }
        }
      } else {
        console.log("🚫 Auto-execution disabled - opportunities logged only");
      }
      
      const loopDuration = Date.now() - loopStartTime;
      console.log(`✅ Arbitrage loop completed in ${loopDuration}ms`);
      
    } catch (error) {
      console.error("❌ Error in arbitrage loop:", error);
    }
  }

  /**
   * Scan for arbitrage opportunities
   * @private
   */
  async scanForOpportunities() {
    // Use the scanner's existing logic to find opportunities
    const opportunities = [];
    
    for (const pair of this.scanner.tokenPairs) {
      try {
        const opportunity = await this.scanner.detectArbitrageForPair(
          pair.assetA, 
          pair.assetB, 
          CONFIG.DEFAULT_SWAP_AMOUNT
        );
        
        if (opportunity && opportunity.netProfitPercent >= this.config.minProfitThreshold) {
          opportunities.push({
            ...opportunity,
            pair: pair.symbol,
            assetInfo: pair.tokenInfo
          });
        }
        
      } catch (error) {
        console.log(`   ${pair.symbol}: Scan error - ${error.message}`);
      }
    }
    
    // Sort by profitability (highest first)
    return opportunities.sort((a, b) => b.netProfitPercent - a.netProfitPercent);
  }

  /**
   * Evaluate and potentially execute an arbitrage opportunity
   * @param {Object} opportunity 
   * @returns {Promise<boolean>} - True if executed, false if skipped
   * @private
   */
  async evaluateAndExecuteOpportunity(opportunity) {
    try {
      // Check rate limiting
      if (!this.checkExecutionRateLimit()) {
        console.log(`⏳ Rate limit reached: ${this.config.maxExecutionsPerHour}/hour`);
        return false;
      }
      
      // Validate opportunity is still current
      const isValid = await this.executor.validateOpportunity(opportunity);
      if (!isValid) {
        console.log(`⚠️ Opportunity no longer valid: ${opportunity.pair}`);
        return false;
      }
      
      // Check trade size limits
      const tradeAmount = BigInt(opportunity.amountIn);
      if (tradeAmount > this.config.maxTradeAmount) {
        console.log(`⚠️ Trade amount too large: ${tradeAmount} > ${this.config.maxTradeAmount}`);
        return false;
      }
      
      // Execute the arbitrage
      console.log(`🎯 Executing high-confidence arbitrage: ${opportunity.pair} (${opportunity.netProfitPercent.toFixed(2)}%)`);
      const executionResult = await this.executor.executeArbitrage(opportunity);
      
      // Track execution
      this.executionHistory.push(Date.now());
      
      if (executionResult && executionResult.success) {
        this.profitableExecutions++;
        this.totalProfitADA += executionResult.actualProfitADA || 0;
        
        console.log(`✅ ARBITRAGE SUCCESS: ${opportunity.pair}`);
        console.log(`   Profit: ${executionResult.actualProfitADA?.toFixed(3) || 'simulated'} ADA`);
        return true;
      } else {
        console.log(`❌ ARBITRAGE FAILED: ${opportunity.pair}`);
        console.log(`   Error: ${executionResult?.message || 'Unknown error'}`);
        return false;
      }
      
    } catch (error) {
      console.error("❌ Error evaluating opportunity:", error);
      return false;
    }
  }

  /**
   * Check if we've hit the execution rate limit
   * @returns {boolean}
   * @private
   */
  checkExecutionRateLimit() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    // Clean old executions
    this.executionHistory = this.executionHistory.filter(time => time > oneHourAgo);
    
    return this.executionHistory.length < this.config.maxExecutionsPerHour;
  }

  /**
   * Check for emergency stop file
   * @returns {Promise<boolean>} - True if emergency stop is active
   * @private
   */
  async checkEmergencyStop() {
    try {
      const fs = await import('fs/promises');
      await fs.access(this.config.emergencyStopFile);
      console.log("🚨 EMERGENCY STOP DETECTED - Stopping bot");
      this.stop();
      return true;
    } catch {
      return false; // File doesn't exist, continue normally
    }
  }

  /**
   * Print session summary
   * @private
   */
  printSessionSummary() {
    const runtime = this.botStartTime ? (Date.now() - this.botStartTime) / 1000 : 0;
    const hours = Math.floor(runtime / 3600);
    const minutes = Math.floor((runtime % 3600) / 60);
    
    console.log("\\n📊 SESSION SUMMARY");
    console.log("=" .repeat(50));
    console.log(`⏱️  Runtime: ${hours}h ${minutes}m`);
    console.log(`🔍 Total Scans: ${this.totalScans}`);
    console.log(`🎯 Opportunities Detected: ${this.opportunitiesDetected}`);
    console.log(`⚡ Arbitrages Executed: ${this.arbitragesExecuted}`);
    console.log(`✅ Profitable Executions: ${this.profitableExecutions}`);
    console.log(`💰 Total Profit: ${this.totalProfitADA.toFixed(3)} ADA`);
    
    if (this.arbitragesExecuted > 0) {
      const successRate = (this.profitableExecutions / this.arbitragesExecuted) * 100;
      const avgProfit = this.totalProfitADA / this.profitableExecutions;
      console.log(`📈 Success Rate: ${successRate.toFixed(1)}%`);
      console.log(`📊 Average Profit: ${avgProfit.toFixed(3)} ADA`);
    }
    
    console.log("=" .repeat(50));
  }

  /**
   * Get real-time bot statistics
   */
  async getStats() {
    const runtime = this.botStartTime ? (Date.now() - this.botStartTime) / 1000 : 0;
    const scansPerMinute = this.totalScans > 0 && runtime > 0 ? (this.totalScans / runtime) * 60 : 0;
    
    // Get recent opportunities and executions
    const recentOpportunities = await this.scanner.getRecentOpportunities(5);
    const executorStats = this.executor.getExecutionStats();
    const recentExecutions = await this.executor.getExecutionHistory(5);
    
    return {
      bot: {
        isRunning: this.isRunning,
        dryRun: this.dryRun,
        runtime: Math.floor(runtime),
        totalScans: this.totalScans,
        opportunitiesDetected: this.opportunitiesDetected,
        arbitragesExecuted: this.arbitragesExecuted,
        profitableExecutions: this.profitableExecutions,
        totalProfitADA: this.totalProfitADA,
        scansPerMinute: scansPerMinute.toFixed(2),
        successRate: this.arbitragesExecuted > 0 ? (this.profitableExecutions / this.arbitragesExecuted) * 100 : 0
      },
      config: this.config,
      scanner: await this.scanner.getStats(),
      executor: executorStats,
      recent: {
        opportunities: recentOpportunities,
        executions: recentExecutions
      }
    };
  }

  /**
   * Emergency stop the bot
   */
  emergencyStop() {
    console.log("🚨 EMERGENCY STOP ACTIVATED");
    this.executor.emergencyStop();
    this.stop();
  }

  /**
   * Update configuration on the fly
   * @param {Object} newConfig 
   */
  updateConfig(newConfig) {
    console.log("⚙️ Updating bot configuration...");
    this.config = { ...this.config, ...newConfig };
    
    // Restart with new schedule if interval changed
    if (newConfig.scanInterval && this.isRunning) {
      console.log("🔄 Restarting with new scan interval...");
      this.stop();
      setTimeout(() => this.start(), 1000);
    }
    
    console.log("✅ Configuration updated");
  }
}

// CLI functionality if run directly
async function main() {
  const bot = new ArbitrageBot();
  
  try {
    await bot.initialize();
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
      case 'start':
        bot.start();
        console.log("Press Ctrl+C to stop the bot");
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
          console.log("\\n🛑 Shutting down Arbitrage Bot...");
          bot.stop();
          process.exit(0);
        });
        
        // Keep process alive
        setInterval(() => {}, 1000);
        break;
        
      case 'stats':
        const stats = await bot.getStats();
        console.log("📊 Arbitrage Bot Statistics:");
        console.log(JSON.stringify(stats, null, 2));
        process.exit(0);
        break;
        
      case 'scan':
        // Single scan for testing
        await bot.performArbitrageLoop();
        process.exit(0);
        break;
        
      default:
        console.log("Autonomous Arbitrage Bot for Cardano");
        console.log("=====================================");
        console.log("");
        console.log("Usage:");
        console.log("  npm run arbitrage-bot start  - Start autonomous trading");
        console.log("  npm run arbitrage-bot stats  - Show bot statistics");
        console.log("  npm run arbitrage-bot scan   - Single scan for testing");
        console.log("");
        console.log("Environment Variables:");
        console.log("  DRY_RUN=true                 - Enable dry run mode (no real trades)");
        console.log("");
        console.log("Safety Features:");
        console.log("  - Create 'EMERGENCY_STOP' file to stop trading immediately");
        console.log("  - Rate limiting: Max 10 trades per hour by default");
        console.log("  - Opportunity validation before execution");
        console.log("  - Comprehensive logging of all activities");
        process.exit(1);
    }
    
  } catch (error) {
    console.error("❌ Arbitrage Bot failed:", error);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default ArbitrageBot;