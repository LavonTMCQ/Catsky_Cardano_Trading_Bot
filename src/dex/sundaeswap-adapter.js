// SundaeSwap DEX Adapter
import { Asset } from "@minswap/sdk";
import { BaseDEXAdapter } from "./base-dex-adapter.js";

export class SundaeSwapAdapter extends BaseDEXAdapter {
  constructor(networkId, blockfrostProjectId, config = {}) {
    super("SundaeSwap", networkId, config);
    this.blockfrostProjectId = blockfrostProjectId;
    this.apiBaseUrl = "https://stats.sundaeswap.finance/api";
  }

  async initialize() {
    try {
      // Test API connectivity - using simple endpoint test
      const response = await fetch(`${this.apiBaseUrl}/ticks`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`SundaeSwap API returned ${response.status}`);
      }
      
      this.isInitialized = true;
      console.log(`✅ ${this.name} adapter initialized`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to initialize ${this.name} adapter:`, error);
      throw error;
    }
  }

  async getPool(assetA, assetB) {
    this._ensureInitialized();
    
    try {
      const response = await fetch(`${this.apiBaseUrl}/pools`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`SundaeSwap API returned ${response.status}`);
      }
      
      const pools = await response.json();
      
      // Find pool for the asset pair
      const assetAStr = this._assetToString(assetA);
      const assetBStr = this._assetToString(assetB);
      
      const pool = pools.find(p => 
        (p.assetA === assetAStr && p.assetB === assetBStr) ||
        (p.assetA === assetBStr && p.assetB === assetAStr)
      );
      
      if (pool) {
        return this.normalizePoolData(pool);
      }
      
      return null;
    } catch (error) {
      console.error(`${this.name}: Error getting pool for ${assetA.toString()} / ${assetB.toString()}:`, error);
      return null;
    }
  }

  async getPrice(assetA, assetB) {
    this._ensureInitialized();
    
    const pool = await this.getPool(assetA, assetB);
    if (!pool) {
      throw new Error(`No pool found for ${assetA.toString()} / ${assetB.toString()}`);
    }

    // Calculate price as reserveB / reserveA
    const price = Number(pool.reserveB) / Number(pool.reserveA);
    
    return {
      price,
      reserves: {
        reserveA: pool.reserveA,
        reserveB: pool.reserveB
      },
      pool: pool
    };
  }

  async calculateSwapOutput(assetIn, assetOut, amountIn) {
    this._ensureInitialized();
    
    const pool = await this.getPool(assetIn, assetOut);
    if (!pool) {
      throw new Error(`No pool found for ${assetIn.toString()} / ${assetOut.toString()}`);
    }

    // Determine swap direction
    const assetInStr = this._assetToString(assetIn);
    const assetInIsA = assetInStr === this._assetToString(pool.assetA);
    const reserveIn = assetInIsA ? pool.reserveA : pool.reserveB;
    const reserveOut = assetInIsA ? pool.reserveB : pool.reserveA;
    
    // SundaeSwap uses 0.3% fee
    const fee = 0.003;
    const amountInWithFee = Number(amountIn) * (1 - fee);
    
    // Constant product formula: x * y = k
    const amountOut = (amountInWithFee * Number(reserveOut)) / (Number(reserveIn) + amountInWithFee);
    
    if (amountOut <= 0) {
      throw new Error("Insufficient liquidity for swap");
    }

    const priceImpact = this.calculatePriceImpact(amountIn, BigInt(reserveIn), BigInt(reserveOut));

    return {
      amountOut: BigInt(Math.floor(amountOut)),
      slippage: priceImpact,
      fee: fee * 100, // Convert to percentage
      priceImpact,
      pool: pool
    };
  }

  async buildSwapTransaction(params) {
    // SundaeSwap transaction building would require their SDK
    // For now, throw error - this would need SundaeSwap SDK integration
    throw new Error(`${this.name}: Transaction building not yet implemented - requires SundaeSwap SDK`);
  }

  async executeSwap(assetIn, assetOut, amountIn, minimumAmountOut, walletAddress, lucid) {
    // SundaeSwap execution would require their SDK integration
    throw new Error(`${this.name}: Swap execution not yet implemented - requires SundaeSwap SDK`);
  }

  getFeeStructure() {
    return {
      tradingFee: 0.003, // 0.3%
      networkFee: 0.3, // ~0.3 ADA average
      batcherFee: 2.5 // ~2.5 ADA for SundaeSwap
    };
  }

  async getPoolLiquidity(assetA, assetB) {
    this._ensureInitialized();
    
    const pool = await this.getPool(assetA, assetB);
    if (!pool) {
      throw new Error(`No pool found for ${assetA.toString()} / ${assetB.toString()}`);
    }

    const adaReserve = this._isADA(pool.assetA) ? pool.reserveA : pool.reserveB;
    const tokenReserve = this._isADA(pool.assetA) ? pool.reserveB : pool.reserveA;
    const totalLiquidity = BigInt(adaReserve) + BigInt(tokenReserve);

    return {
      liquidityADA: BigInt(adaReserve),
      liquidityToken: BigInt(tokenReserve),
      totalLiquidity,
      pool: pool
    };
  }

  /**
   * Convert Asset to string representation
   * @private
   */
  _assetToString(asset) {
    if (this._isADA(asset)) {
      return "ada";
    }
    return `${asset.policyId}.${asset.tokenName}`;
  }

  /**
   * Check if asset is ADA
   * @private
   */
  _isADA(asset) {
    return (!asset.policyId || asset.policyId === "") && 
           (!asset.tokenName || asset.tokenName === "");
  }

  normalizePoolData(rawPool) {
    // Convert SundaeSwap pool format to our standard format
    return {
      id: rawPool.id || rawPool.poolId,
      assetA: rawPool.assetA,
      assetB: rawPool.assetB,
      reserveA: BigInt(rawPool.quantityA || rawPool.reserveA || 0),
      reserveB: BigInt(rawPool.quantityB || rawPool.reserveB || 0),
      fee: rawPool.fee || 0.003,
      dex: this.name,
      lastUpdated: Date.now(),
      // SundaeSwap specific fields
      version: rawPool.version || "v1",
      lpToken: rawPool.lpToken
    };
  }
}

export default SundaeSwapAdapter;