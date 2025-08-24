// Splash DEX Adapter
import { Asset } from "@minswap/sdk";
import { BaseDEXAdapter } from "./base-dex-adapter.js";

export class SplashAdapter extends BaseDEXAdapter {
  constructor(networkId, blockfrostProjectId, config = {}) {
    super("Splash", networkId, config);
    this.blockfrostProjectId = blockfrostProjectId;
    this.apiBaseUrl = networkId === 1 ? "https://api.splash.trading" : "https://api-testnet.splash.trading";
  }

  async initialize() {
    try {
      // Test API connectivity - Splash uses /pools endpoint
      const response = await fetch(`${this.apiBaseUrl}/pools`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Catsky-Trading-Bot/1.0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Splash API returned ${response.status}`);
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
          'Accept': 'application/json',
          'User-Agent': 'Catsky-Trading-Bot/1.0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Splash API returned ${response.status}`);
      }
      
      const pools = await response.json();
      
      // Find pool for the asset pair
      const assetAStr = this._assetToString(assetA);
      const assetBStr = this._assetToString(assetB);
      
      const pool = pools.find(p => 
        (p.assetA === assetAStr && p.assetB === assetBStr) ||
        (p.assetA === assetBStr && p.assetB === assetAStr) ||
        (p.tokenA === assetAStr && p.tokenB === assetBStr) ||
        (p.tokenA === assetBStr && p.tokenB === assetAStr)
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
    
    // Splash uses 0.3% fee
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
    // Splash transaction building would require their SDK
    // For now, throw error - this would need Splash SDK integration
    throw new Error(`${this.name}: Transaction building not yet implemented - requires Splash SDK`);
  }

  async executeSwap(assetIn, assetOut, amountIn, minimumAmountOut, walletAddress, lucid) {
    // Splash execution would require their SDK integration
    throw new Error(`${this.name}: Swap execution not yet implemented - requires Splash SDK`);
  }

  getFeeStructure() {
    return {
      tradingFee: 0.003, // 0.3%
      networkFee: 0.3, // ~0.3 ADA average
      batcherFee: 1.5 // ~1.5 ADA for Splash
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
   * Convert Asset to string representation for Splash
   * @private
   */
  _assetToString(asset) {
    if (this._isADA(asset)) {
      return "lovelace";
    }
    return `${asset.policyId}${asset.tokenName}`;
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
    // Convert Splash pool format to our standard format
    return {
      id: rawPool.id || rawPool.poolId,
      assetA: rawPool.assetA || rawPool.tokenA,
      assetB: rawPool.assetB || rawPool.tokenB,
      reserveA: BigInt(rawPool.reserveA || rawPool.quantityA || rawPool.amountA || 0),
      reserveB: BigInt(rawPool.reserveB || rawPool.quantityB || rawPool.amountB || 0),
      fee: rawPool.fee || 0.003,
      dex: this.name,
      lastUpdated: Date.now(),
      // Splash specific fields
      version: rawPool.version || "v1",
      lpToken: rawPool.lpToken,
      volume24h: rawPool.volume24h,
      tvl: rawPool.tvl
    };
  }
}

export default SplashAdapter;