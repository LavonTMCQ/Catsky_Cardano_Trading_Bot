#!/usr/bin/env node

// Test all DEX connections and report status
import { UnifiedDEXInterface } from './dex/unified-dex-interface.js';
import { CONFIG } from './config/index.js';
import { NetworkId, Asset } from '@minswap/sdk';
import chalk from 'chalk';

async function testDEXConnections() {
  console.log(chalk.cyan.bold('\n🔍 Testing All DEX Connections...\n'));
  
  const dexInterface = new UnifiedDEXInterface(NetworkId.MAINNET, CONFIG.BF_PROJECT_ID);
  
  // Initialize all DEXs
  await dexInterface.initialize();
  
  console.log(chalk.white.bold('\n📊 DEX Connection Status:\n'));
  console.log('─'.repeat(50));
  
  const dexStatus = {
    working: [],
    failed: [],
    partial: []
  };
  
  // Test each DEX with a simple price query
  const testPair = {
    assetA: { policyId: '', tokenName: '' }, // ADA
    assetB: CONFIG.SUPPORTED_TOKENS.CATSKY
  };
  
  for (const dexName of dexInterface.getEnabledDEXs()) {
    process.stdout.write(`Testing ${dexName}...`);
    
    try {
      const adapter = dexInterface.getDEXAdapter(dexName);
      const price = await adapter.getPrice(testPair.assetA, testPair.assetB);
      
      if (price && price.price > 0) {
        console.log(chalk.green(' ✅ WORKING'));
        console.log(chalk.gray(`  └─ ADA/CATSKY Price: ${price.price.toFixed(4)}`));
        dexStatus.working.push(dexName);
      } else {
        console.log(chalk.yellow(' ⚠️ PARTIAL'));
        console.log(chalk.gray('  └─ Adapter initialized but no price data'));
        dexStatus.partial.push(dexName);
      }
    } catch (error) {
      console.log(chalk.red(' ❌ FAILED'));
      console.log(chalk.gray(`  └─ ${error.message}`));
      dexStatus.failed.push(dexName);
    }
  }
  
  // Summary
  console.log('\n' + '─'.repeat(50));
  console.log(chalk.white.bold('\n📈 Summary:\n'));
  
  console.log(chalk.green(`✅ Working DEXs: ${dexStatus.working.length}`));
  if (dexStatus.working.length > 0) {
    console.log(chalk.gray(`   ${dexStatus.working.join(', ')}`));
  }
  
  console.log(chalk.yellow(`⚠️ Partial DEXs: ${dexStatus.partial.length}`));
  if (dexStatus.partial.length > 0) {
    console.log(chalk.gray(`   ${dexStatus.partial.join(', ')}`));
  }
  
  console.log(chalk.red(`❌ Failed DEXs: ${dexStatus.failed.length}`));
  if (dexStatus.failed.length > 0) {
    console.log(chalk.gray(`   ${dexStatus.failed.join(', ')}`));
  }
  
  // Token test
  console.log(chalk.white.bold('\n🪙 Testing Token Coverage:\n'));
  console.log('─'.repeat(50));
  
  let workingTokens = 0;
  let totalTokens = Object.keys(CONFIG.SUPPORTED_TOKENS).length;
  
  for (const [tokenName, tokenConfig] of Object.entries(CONFIG.SUPPORTED_TOKENS)) {
    process.stdout.write(`${tokenName}...`);
    
    try {
      const testAsset = {
        assetA: { policyId: '', tokenName: '' }, // ADA
        assetB: tokenConfig
      };
      
      const prices = await dexInterface.getAllPrices(testAsset.assetA, testAsset.assetB);
      
      if (prices.length > 0) {
        console.log(chalk.green(` ✅ (${prices.length} DEX${prices.length > 1 ? 's' : ''})`));
        workingTokens++;
      } else {
        console.log(chalk.yellow(' ⚠️ No prices'));
      }
    } catch (error) {
      console.log(chalk.red(' ❌ Failed'));
    }
  }
  
  console.log('\n' + '─'.repeat(50));
  console.log(chalk.white.bold('\n🎯 Final Results:\n'));
  
  const successRate = (dexStatus.working.length / dexInterface.getEnabledDEXs().length * 100).toFixed(1);
  const tokenCoverage = (workingTokens / totalTokens * 100).toFixed(1);
  
  console.log(`DEX Success Rate: ${successRate}%`);
  console.log(`Token Coverage: ${tokenCoverage}% (${workingTokens}/${totalTokens} tokens)`);
  
  if (successRate >= 50) {
    console.log(chalk.green.bold('\n✅ System is operational and ready for trading!'));
  } else if (successRate >= 25) {
    console.log(chalk.yellow.bold('\n⚠️ System partially operational - limited trading available'));
  } else {
    console.log(chalk.red.bold('\n❌ System needs configuration - check API keys and network'));
  }
  
  // Recommendations
  console.log(chalk.cyan.bold('\n💡 Recommendations:\n'));
  
  if (dexStatus.failed.includes('SundaeSwap')) {
    console.log('• Fix SundaeSwap: Update API endpoint or use SDK');
  }
  if (dexStatus.failed.includes('Splash')) {
    console.log('• Splash API not yet available - monitor docs.splash.trade');
  }
  if (dexStatus.partial.length > 0) {
    console.log('• Partial DEXs may need DexHunter API key for full functionality');
  }
  if (workingTokens < totalTokens) {
    console.log('• Some tokens may not have liquidity pools on all DEXs');
  }
  
  console.log('');
}

// Run test
testDEXConnections().catch(error => {
  console.error(chalk.red('Test failed:'), error);
  process.exit(1);
});