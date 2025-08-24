// Trading Bot Configuration
import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  // Blockchain Configuration
  NETWORK: process.env.NETWORK || "mainnet",
  BF_PROJECT_ID: process.env.BF_PROJECT_ID,
  MNEMONIC: process.env.MNEMONIC,
  
  // Trading Configuration
  DEFAULT_SWAP_AMOUNT: 1_000_000n, // 1 ADA in lovelace
  DEFAULT_SLIPPAGE: 0.5, // 0.5%
  ARBITRAGE_PROFIT_THRESHOLD: 2.0, // 2% minimum profit
  MAX_POSITION_SIZE: 0.1, // 10% of portfolio max per trade
  
  // Risk Management
  DAILY_LOSS_LIMIT: 0.05, // 5% daily loss limit
  STOP_LOSS_PERCENT: -0.02, // 2% stop loss
  MIN_LIQUIDITY_ADA: 10_000, // Minimum 10k ADA pool liquidity
  
  // Bot Operation
  PRICE_UPDATE_INTERVAL: 30000, // 30 seconds
  MAIN_LOOP_INTERVAL: 30000, // 30 seconds
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000, // 5 seconds
  
  // Supported Tokens (only tokens with confirmed liquidity pools)
  SUPPORTED_TOKENS: {
    CATSKY: {
      policyId: "9b426921a21f54600711da0be1a12b026703a9bd8eb9848d08c9d921",
      tokenName: "434154534b59",
      fullUnit: "9b426921a21f54600711da0be1a12b026703a9bd8eb9848d08c9d921434154534b59",
      symbol: "CATSKY"
    },
    HOSKY: {
      policyId: "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235",
      tokenName: "484f534b59",
      fullUnit: "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59",
      symbol: "HOSKY"
    },
    MIN: {
      policyId: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6",
      tokenName: "4d494e",
      fullUnit: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e",
      symbol: "MIN"
    },
    WMT: {
      policyId: "1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e",
      tokenName: "776f726c646d6f62696c65746f6b656e",
      fullUnit: "1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e776f726c646d6f62696c65746f6b656e",
      symbol: "WMT"
    },
    MILK: {
      policyId: "8a1cfae21368b8bebbbed9800fec304e95cce39a2a57dc35e2e3ebaa",
      tokenName: "4d494c4b",
      fullUnit: "8a1cfae21368b8bebbbed9800fec304e95cce39a2a57dc35e2e3ebaa4d494c4b",
      symbol: "MILK"
    },
    AGIX: {
      policyId: "f43a62fdc3965df486de8a0d32fe800963589c41b38946602a0dc535",
      tokenName: "41474958",
      fullUnit: "f43a62fdc3965df486de8a0d32fe800963589c41b38946602a0dc53541474958",
      symbol: "AGIX"
    },
    SUNDAE: {
      policyId: "9a9693a9a37912a5097918f97918d15240c92ab729a0b7c4aa144d77",
      tokenName: "53554e444145",
      fullUnit: "9a9693a9a37912a5097918f97918d15240c92ab729a0b7c4aa144d7753554e444145",
      symbol: "SUNDAE"
    },
    VYFI: {
      policyId: "804f5544c1962a40546827cab750a88404dc7108c0f588b72964754f",
      tokenName: "56594649",
      fullUnit: "804f5544c1962a40546827cab750a88404dc7108c0f588b72964754f56594649",
      symbol: "VYFI"
    },
    LENFI: {
      policyId: "8fef2d34078659493ce161a6c7fba4b56afefa8535296a5743f69587",
      tokenName: "41414441",
      fullUnit: "8fef2d34078659493ce161a6c7fba4b56afefa8535296a5743f6958741414441",
      symbol: "LENFI"
    },
    NMKR: {
      policyId: "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489",
      tokenName: "4e4d4b52",
      fullUnit: "5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc928434894e4d4b52",
      symbol: "NMKR"
    },
    LQ: {
      policyId: "da8c30857834c6ae7203935b89278c532b3995245295456f993e1d24",
      tokenName: "4c51",
      fullUnit: "da8c30857834c6ae7203935b89278c532b3995245295456f993e1d244c51",
      symbol: "LQ"
    },
    CLAP: {
      policyId: "db30c7905f598ed0154de14f970de0f61f0cb3943ed82c891968480a",
      tokenName: "434c4150",
      fullUnit: "db30c7905f598ed0154de14f970de0f61f0cb3943ed82c891968480a434c4150",
      symbol: "CLAP"
    },
    COPI: {
      policyId: "b6a7467ea1deb012808ef4e87b5ff371e85f7142d7b356a40d9b42a0",
      tokenName: "436f726e75636f70696173205b76696120436861696e506f72742e696f5d",
      fullUnit: "b6a7467ea1deb012808ef4e87b5ff371e85f7142d7b356a40d9b42a0436f726e75636f70696173205b76696120436861696e506f72742e696f5d",
      symbol: "COPI"
    },
    C3: {
      policyId: "8e51398904a5d3fc129fbf4f1589701de23c7824d5c90fdb9490e15a",
      tokenName: "434841524c4933",
      fullUnit: "8e51398904a5d3fc129fbf4f1589701de23c7824d5c90fdb9490e15a434841524c4933",
      symbol: "C3"
    }
  },
  
  // DEX Configuration
  DEX_FEES: {
    MINSWAP: 0.003, // 0.3%
    SUNDAESWAP: 0.003, // 0.3%
    MUESLISWAP: 0.003, // 0.3%
    SPLASH: 0.003, // 0.3%
    WINGRIDERS: 0.0035, // 0.35%
    SPECTRUM: 0.003, // 0.3%
    VYFINANCE: 0.003 // 0.3%
  },
  
  // Network Fees
  NETWORK_FEE_ESTIMATE: 0.3, // ~0.3 ADA average network fee
  
  // Database
  DATABASE_PATH: "./data/trading_bot.db",
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  LOG_FILE: "./logs/trading_bot.log",
  
  // Safety Features
  DRY_RUN_MODE: process.env.DRY_RUN === "true",
  EMERGENCY_STOP_FILE: "./emergency_stop.flag"
};

// Validation
export function validateConfig() {
  const required = ['BF_PROJECT_ID', 'MNEMONIC'];
  const missing = required.filter(key => !CONFIG[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  const mnemonicWords = CONFIG.MNEMONIC?.trim().split(' ').filter(word => word.length > 0);
  if (CONFIG.MNEMONIC && mnemonicWords.length !== 12) {
    throw new Error(`Invalid MNEMONIC: Must be 12 words, got ${mnemonicWords.length}`);
  }
  
  console.log('✅ Configuration validated successfully');
  console.log(`📊 Mode: ${CONFIG.DRY_RUN_MODE ? 'DRY RUN' : 'LIVE TRADING'}`);
  console.log(`🌐 Network: ${CONFIG.NETWORK}`);
}

export default CONFIG;