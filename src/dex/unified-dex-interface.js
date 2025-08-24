// Unified DEX Interface - Manages all DEX adapters
import { NetworkId } from "@minswap/sdk";
import { MinswapAdapter } from "./minswap-adapter.js";
import { SundaeSwapAdapter } from "./sundaeswap-adapter.js";
import { MuesliSwapAdapter } from "./muesliswap-adapter.js";
import { SplashAdapter } from "./splash-adapter.js";
import { WingRidersAdapter } from "./wingriders-adapter.js";
import { SpectrumAdapter } from "./spectrum-adapter.js";
import { VyFinanceAdapter } from "./vyfinance-adapter.js";
import { CONFIG } from "../config/index.js";

export class UnifiedDEXInterface {
  constructor(networkId = NetworkId.MAINNET, blockfrostProjectId) {
    this.networkId = networkId;
    this.blockfrostProjectId = blockfrostProjectId || CONFIG.BF_PROJECT_ID;
    this.adapters = new Map();
    this.isInitialized = false;
    this.enabledDEXs = ['Minswap', 'SundaeSwap', 'MuesliSwap', 'Splash', 'WingRiders', 'Spectrum', 'VyFinance']; // Enable all DEXs
  }

  /**
   * Initialize all DEX adapters
   */
  async initialize() {
    try {
      console.log("🔗 Initializing Unified DEX Interface...");
      
      // Initialize Minswap (primary DEX)
      const minswap = new MinswapAdapter(this.networkId, this.blockfrostProjectId);
      await minswap.initialize();
      this.adapters.set('Minswap', minswap);

      // Initialize other DEXs (gracefully handle failures)
      if (this.enabledDEXs.includes('SundaeSwap')) {
        try {
          const sundaeswap = new SundaeSwapAdapter(this.networkId, this.blockfrostProjectId);
          await sundaeswap.initialize();
          this.adapters.set('SundaeSwap', sundaeswap);
        } catch (error) {
          console.warn(`⚠️ SundaeSwap adapter failed to initialize:`, error.message);
        }
      }

      if (this.enabledDEXs.includes('MuesliSwap')) {
        try {
          const muesliswap = new MuesliSwapAdapter(this.networkId, this.blockfrostProjectId);
          await muesliswap.initialize();
          this.adapters.set('MuesliSwap', muesliswap);
        } catch (error) {
          console.warn(`⚠️ MuesliSwap adapter failed to initialize:`, error.message);
        }
      }

      if (this.enabledDEXs.includes('Splash')) {
        try {
          const splash = new SplashAdapter(this.networkId, this.blockfrostProjectId);
          await splash.initialize();
          this.adapters.set('Splash', splash);
        } catch (error) {
          console.warn(`⚠️ Splash adapter failed to initialize:`, error.message);
        }
      }

      if (this.enabledDEXs.includes('WingRiders')) {
        try {
          const wingriders = new WingRidersAdapter(this.networkId, this.blockfrostProjectId);
          await wingriders.initialize();
          this.adapters.set('WingRiders', wingriders);
        } catch (error) {
          console.warn(`⚠️ WingRiders adapter failed to initialize:`, error.message);
        }
      }

      if (this.enabledDEXs.includes('Spectrum')) {
        try {
          const spectrum = new SpectrumAdapter(this.networkId, this.blockfrostProjectId);
          await spectrum.initialize();
          this.adapters.set('Spectrum', spectrum);
        } catch (error) {
          console.warn(`⚠️ Spectrum adapter failed to initialize:`, error.message);
        }
      }

      if (this.enabledDEXs.includes('VyFinance')) {
        try {
          const vyfinance = new VyFinanceAdapter(this.networkId, this.blockfrostProjectId);
          await vyfinance.initialize();
          this.adapters.set('VyFinance', vyfinance);
        } catch (error) {
          console.warn(`⚠️ VyFinance adapter failed to initialize:`, error.message);
        }
      }

      this.isInitialized = true;
      console.log(`✅ Initialized ${this.adapters.size} DEX adapters:`, Array.from(this.adapters.keys()));
      
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize Unified DEX Interface:", error);
      throw error;
    }
  }

  /**
   * Get all prices for a token pair across all DEXs
   * @param {Asset} assetA 
   * @param {Asset} assetB 
   * @returns {Promise<Array<{dex: string, price: number, reserves: Object, pool: Object}>>}
   */
  async getAllPrices(assetA, assetB) {
    this._ensureInitialized();
    
    const prices = [];
    
    for (const [dexName, adapter] of this.adapters.entries()) {
      try {
        const priceData = await adapter.getPrice(assetA, assetB);
        prices.push({
          dex: dexName,
          ...priceData,
          timestamp: Date.now()
        });
      } catch (error) {
        console.log(`${dexName}: No price available for ${assetA.toString()}/${assetB.toString()}`);
        // Don't throw, continue with other DEXs
      }
    }

    return prices;
  }

  /**
   * Find best price for buying (lowest ask)
   * @param {Asset} assetA 
   * @param {Asset} assetB 
   * @returns {Promise<{dex: string, price: number, adapter: BaseDEXAdapter}>}
   */
  async getBestBuyPrice(assetA, assetB) {
    const prices = await this.getAllPrices(assetA, assetB);
    
    if (prices.length === 0) {
      throw new Error(`No prices available for ${assetA.toString()}/${assetB.toString()}`);
    }

    // Find lowest price (best for buying)
    const bestPrice = prices.reduce((best, current) => 
      current.price < best.price ? current : best
    );

    return {
      ...bestPrice,
      adapter: this.adapters.get(bestPrice.dex)
    };
  }

  /**
   * Find best price for selling (highest bid)
   * @param {Asset} assetA 
   * @param {Asset} assetB 
   * @returns {Promise<{dex: string, price: number, adapter: BaseDEXAdapter}>}
   */
  async getBestSellPrice(assetA, assetB) {
    const prices = await this.getAllPrices(assetA, assetB);
    
    if (prices.length === 0) {
      throw new Error(`No prices available for ${assetA.toString()}/${assetB.toString()}`);
    }

    // Find highest price (best for selling)
    const bestPrice = prices.reduce((best, current) => 
      current.price > best.price ? current : best
    );

    return {
      ...bestPrice,
      adapter: this.adapters.get(bestPrice.dex)
    };
  }

  /**
   * Detect arbitrage opportunities across DEXs
   * @param {Asset} assetA 
   * @param {Asset} assetB 
   * @param {bigint} amountIn 
   * @returns {Promise<Object|null>} Arbitrage opportunity or null
   */
  async detectArbitrage(assetA, assetB, amountIn = 1_000_000n) {
    this._ensureInitialized();
    
    try {
      const prices = await this.getAllPrices(assetA, assetB);
      
      if (prices.length < 2) {
        return null; // Need at least 2 DEXs for arbitrage
      }

      // Find highest and lowest prices
      const highestPrice = prices.reduce((best, current) => 
        current.price > best.price ? current : best
      );
      
      const lowestPrice = prices.reduce((best, current) => 
        current.price < best.price ? current : best
      );

      if (highestPrice.dex === lowestPrice.dex) {
        return null; // Same DEX, no arbitrage
      }

      // Calculate potential profit
      const priceDifference = highestPrice.price - lowestPrice.price;
      const percentDifference = (priceDifference / lowestPrice.price) * 100;

      // Get fee structures
      const buyDEXFees = this.adapters.get(lowestPrice.dex).getFeeStructure();
      const sellDEXFees = this.adapters.get(highestPrice.dex).getFeeStructure();
      
      const totalFees = buyDEXFees.tradingFee + buyDEXFees.networkFee + 
                       sellDEXFees.tradingFee + sellDEXFees.networkFee;
      const totalFeePercent = totalFees * 100;

      const netProfitPercent = percentDifference - totalFeePercent;

      // Only return if profitable after fees
      if (netProfitPercent > CONFIG.ARBITRAGE_PROFIT_THRESHOLD) {
        return {
          profitable: true,
          buyDEX: lowestPrice.dex,
          sellDEX: highestPrice.dex,
          buyPrice: lowestPrice.price,
          sellPrice: highestPrice.price,
          priceDifference,
          percentDifference,
          totalFeePercent,
          netProfitPercent,
          estimatedProfit: (netProfitPercent / 100) * Number(amountIn),
          timestamp: Date.now(),
          assetA: assetA.toString(),
          assetB: assetB.toString(),
          amountIn: amountIn.toString()
        };
      }

      return null;
      
    } catch (error) {
      console.error("Error detecting arbitrage:", error);
      return null;
    }
  }

  /**
   * Get specific DEX adapter
   * @param {string} dexName 
   * @returns {BaseDEXAdapter}
   */
  getDEXAdapter(dexName) {
    const adapter = this.adapters.get(dexName);
    if (!adapter) {
      throw new Error(`DEX adapter '${dexName}' not found or not initialized`);
    }
    return adapter;
  }

  /**
   * Get all enabled DEX names
   * @returns {Array<string>}
   */
  getEnabledDEXs() {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get liquidity across all DEXs for a pair
   * @param {Asset} assetA 
   * @param {Asset} assetB 
   * @returns {Promise<Array>}
   */
  async getAllLiquidity(assetA, assetB) {
    this._ensureInitialized();
    
    const liquidityData = [];
    
    for (const [dexName, adapter] of this.adapters.entries()) {
      try {
        const liquidity = await adapter.getPoolLiquidity(assetA, assetB);
        liquidityData.push({
          dex: dexName,
          ...liquidity,
          timestamp: Date.now()
        });
      } catch (error) {
        console.log(`${dexName}: No liquidity data for ${assetA.toString()}/${assetB.toString()}`);
      }
    }

    return liquidityData;
  }

  /**
   * Enable additional DEXs
   * @param {Array<string>} dexNames 
   */
  async enableDEXs(dexNames) {
    for (const dexName of dexNames) {
      if (!this.enabledDEXs.includes(dexName)) {
        this.enabledDEXs.push(dexName);
      }
    }
    
    if (this.isInitialized) {
      // Re-initialize to add new DEXs
      await this.initialize();
    }
  }

  /**
   * Get statistics about all DEXs
   */
  getStats() {
    return {
      totalDEXs: this.adapters.size,
      enabledDEXs: this.getEnabledDEXs(),
      isInitialized: this.isInitialized,
      networkId: this.networkId
    };
  }

  /**
   * Ensure the interface is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error("UnifiedDEXInterface not initialized. Call initialize() first.");
    }
  }
}

export default UnifiedDEXInterface;