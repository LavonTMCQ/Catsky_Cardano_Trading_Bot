#!/usr/bin/env node

// Real-time Trading Dashboard for Catsky Bot
import { PriceMonitor } from './price-monitor.js';
import { ArbitrageScanner } from './arbitrage/scanner.js';
import { UnifiedDEXInterface } from './dex/unified-dex-interface.js';
import { CONFIG } from './config/index.js';
import { NetworkId } from '@minswap/sdk';
import chalk from 'chalk';
import Table from 'cli-table3';

class TradingDashboard {
  constructor() {
    this.priceMonitor = new PriceMonitor();
    this.arbitrageScanner = new ArbitrageScanner();
    this.dexInterface = new UnifiedDEXInterface(NetworkId.MAINNET, CONFIG.BF_PROJECT_ID);
    this.refreshInterval = 10000; // 10 seconds
    this.isRunning = false;
  }

  async initialize() {
    console.log(chalk.cyan('🚀 Initializing Catsky Trading Dashboard...'));
    
    await this.dexInterface.initialize();
    await this.priceMonitor.initialize();
    await this.arbitrageScanner.initialize();
    
    console.log(chalk.green('✅ Dashboard initialized successfully'));
    console.log(chalk.yellow(`📊 Monitoring ${this.dexInterface.getEnabledDEXs().length} DEXs`));
    console.log(chalk.yellow(`🪙 Tracking ${Object.keys(CONFIG.SUPPORTED_TOKENS).length} tokens\n`));
  }

  async displayPriceTable() {
    const table = new Table({
      head: ['Token Pair', 'Minswap', 'MuesliSwap', 'SundaeSwap', 'WingRiders', 'Spread %', 'Arbitrage?'],
      colWidths: [15, 12, 12, 12, 12, 10, 12],
      style: { head: ['cyan'] }
    });

    // Focus on main trading pairs
    const pairs = [
      { assetA: 'ADA', assetB: 'CATSKY' },
      { assetA: 'ADA', assetB: 'MIN' },
      { assetA: 'ADA', assetB: 'HOSKY' },
      { assetA: 'ADA', assetB: 'WMT' },
      { assetA: 'ADA', assetB: 'MILK' }
    ];

    for (const pair of pairs) {
      try {
        const prices = await this.getAllPricesForPair(pair.assetA, pair.assetB);
        const row = this.formatPriceRow(pair, prices);
        table.push(row);
      } catch (error) {
        // Skip pairs without data
      }
    }

    console.log(chalk.bold.white('\n📈 LIVE PRICE MONITOR'));
    console.log(table.toString());
  }

  async getAllPricesForPair(assetASymbol, assetBSymbol) {
    const assetA = assetASymbol === 'ADA' ? 
      { policyId: '', tokenName: '' } : 
      CONFIG.SUPPORTED_TOKENS[assetASymbol];
    
    const assetB = assetBSymbol === 'ADA' ? 
      { policyId: '', tokenName: '' } : 
      CONFIG.SUPPORTED_TOKENS[assetBSymbol];

    if (!assetA || !assetB) return {};

    const prices = {};
    
    for (const [dexName, adapter] of this.dexInterface.adapters.entries()) {
      try {
        const priceData = await adapter.getPrice(assetA, assetB);
        prices[dexName] = priceData.price;
      } catch (error) {
        prices[dexName] = null;
      }
    }
    
    return prices;
  }

  formatPriceRow(pair, prices) {
    const validPrices = Object.values(prices).filter(p => p !== null && p !== undefined);
    const minPrice = Math.min(...validPrices);
    const maxPrice = Math.max(...validPrices);
    const spread = validPrices.length > 1 ? ((maxPrice - minPrice) / minPrice * 100).toFixed(2) : '0.00';
    const hasArbitrage = parseFloat(spread) > 1.0;

    return [
      `${pair.assetA}/${pair.assetB}`,
      prices.Minswap ? chalk.green(prices.Minswap.toFixed(4)) : chalk.gray('-'),
      prices.MuesliSwap ? chalk.green(prices.MuesliSwap.toFixed(4)) : chalk.gray('-'),
      prices.SundaeSwap ? chalk.green(prices.SundaeSwap.toFixed(4)) : chalk.gray('-'),
      prices.WingRiders ? chalk.green(prices.WingRiders.toFixed(4)) : chalk.gray('-'),
      hasArbitrage ? chalk.yellow.bold(`${spread}%`) : chalk.gray(`${spread}%`),
      hasArbitrage ? chalk.green.bold('✅ YES') : chalk.gray('❌ No')
    ];
  }

  async displayArbitrageOpportunities() {
    console.log(chalk.bold.white('\n💰 ARBITRAGE OPPORTUNITIES'));
    
    const opportunities = await this.arbitrageScanner.scanAllPairs();
    
    if (opportunities.length === 0) {
      console.log(chalk.gray('No profitable arbitrage opportunities at this time.'));
      return;
    }

    const table = new Table({
      head: ['Token Pair', 'Buy DEX', 'Buy Price', 'Sell DEX', 'Sell Price', 'Profit %', 'Est. Profit (1000 ADA)'],
      colWidths: [15, 12, 10, 12, 10, 10, 20],
      style: { head: ['yellow'] }
    });

    opportunities
      .sort((a, b) => b.netProfitPercent - a.netProfitPercent)
      .slice(0, 5) // Top 5 opportunities
      .forEach(opp => {
        table.push([
          `${opp.tokenA}/${opp.tokenB}`,
          opp.buyDEX,
          opp.buyPrice.toFixed(4),
          opp.sellDEX,
          opp.sellPrice.toFixed(4),
          chalk.green.bold(`${opp.netProfitPercent.toFixed(2)}%`),
          chalk.yellow.bold(`${(1000 * opp.netProfitPercent / 100).toFixed(2)} ADA`)
        ]);
      });

    console.log(table.toString());
  }

  async displaySystemStats() {
    const stats = {
      activeDEXs: this.dexInterface.getEnabledDEXs().length,
      totalTokens: Object.keys(CONFIG.SUPPORTED_TOKENS).length,
      scanInterval: this.refreshInterval / 1000,
      uptime: process.uptime(),
      memoryUsage: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
    };

    console.log(chalk.bold.white('\n⚙️ SYSTEM STATUS'));
    console.log(chalk.cyan(`Active DEXs: ${stats.activeDEXs}`));
    console.log(chalk.cyan(`Tokens Tracked: ${stats.totalTokens}`));
    console.log(chalk.cyan(`Refresh Rate: ${stats.scanInterval}s`));
    console.log(chalk.cyan(`Uptime: ${Math.floor(stats.uptime / 60)}m ${Math.floor(stats.uptime % 60)}s`));
    console.log(chalk.cyan(`Memory: ${stats.memoryUsage} MB`));
  }

  async displayTradingTips() {
    const tips = [
      '💡 MIN token showing highest spreads - monitor closely!',
      '💡 CATSKY most liquid on Minswap - best for large trades',
      '💡 Early morning (UTC) typically has wider spreads',
      '💡 Keep 5+ ADA in wallet for transaction fees',
      '💡 Use limit orders during high volatility'
    ];

    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    console.log(chalk.dim(`\n${randomTip}`));
  }

  clearScreen() {
    console.clear();
    console.log(chalk.bold.cyan('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║           🐱 CATSKY TRADING BOT DASHBOARD 🚀              ║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝'));
    console.log(chalk.gray(`Last Update: ${new Date().toLocaleString()}`));
  }

  async refresh() {
    this.clearScreen();
    
    try {
      await this.displayPriceTable();
      await this.displayArbitrageOpportunities();
      await this.displaySystemStats();
      await this.displayTradingTips();
    } catch (error) {
      console.error(chalk.red('❌ Dashboard error:'), error.message);
    }
  }

  async start() {
    this.isRunning = true;
    
    // Initial display
    await this.refresh();
    
    // Set up refresh interval
    const interval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(interval);
        return;
      }
      await this.refresh();
    }, this.refreshInterval);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\n👋 Shutting down dashboard...'));
      this.isRunning = false;
      process.exit(0);
    });
  }

  stop() {
    this.isRunning = false;
  }
}

// Main execution
async function main() {
  const dashboard = new TradingDashboard();
  
  try {
    await dashboard.initialize();
    await dashboard.start();
  } catch (error) {
    console.error(chalk.red('❌ Failed to start dashboard:'), error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { TradingDashboard };