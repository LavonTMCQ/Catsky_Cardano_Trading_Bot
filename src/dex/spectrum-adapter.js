// Spectrum (formerly ErgoDEX) DEX Adapter
import { Asset } from "@minswap/sdk";
import { BaseDEXAdapter } from "./base-dex-adapter.js";

export class SpectrumAdapter extends BaseDEXAdapter {
  constructor(networkId, blockfrostProjectId, config = {}) {
    super("Spectrum", networkId, config);
    this.blockfrostProjectId = blockfrostProjectId;
    this.apiBaseUrl = "https://api.spectrum.fi/v1";
  }

  async initialize() {
    try {
      // Test API connectivity
      const response = await fetch(`${this.apiBaseUrl}/price/markets`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        // If API fails, we can still use DexHunter as fallback
        console.warn(`${this.name} API returned ${response.status}, using fallback`);
      }
      
      this.isInitialized = true;
      console.log(`✅ ${this.name} adapter initialized`);
      return true;
    } catch (error) {
      console.warn(`⚠️ ${this.name} API unavailable, using fallback:`, error.message);
      this.isInitialized = true; // Still mark as initialized for fallback
      return true;
    }
  }

  async getPool(assetA, assetB) {
    this._ensureInitialized();
    
    try {
      // Try Spectrum API first
      const assetAStr = this._assetToString(assetA);
      const assetBStr = this._assetToString(assetB);
      
      const response = await fetch(`${this.apiBaseUrl}/amm/pools`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const pools = await response.json();
        
        // Find pool for the asset pair
        const pool = pools.find(p => 
          (this._matchesAsset(p.x, assetAStr) && this._matchesAsset(p.y, assetBStr)) ||
          (this._matchesAsset(p.x, assetBStr) && this._matchesAsset(p.y, assetAStr))
        );
        
        if (pool) {
          return this.normalizePoolData(pool);
        }
      }
      
      return null;
    } catch (error) {
      console.error(`${this.name}: Error getting pool for ${assetA.toString()} / ${assetB.toString()}:`, error);
      return null;
    }
  }

  _matchesAsset(poolAsset, assetStr) {
    if (assetStr === "lovelace" && poolAsset.ticker === "ADA") {
      return true;
    }
    return poolAsset.id === assetStr;
  }

  async getPrice(assetA, assetB) {
    this._ensureInitialized();
    
    const pool = await this.getPool(assetA, assetB);
    if (!pool) {
      throw new Error(`No pool found for ${assetA.toString()} / ${assetB.toString()}`);
    }

    // Calculate price from pool reserves
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
    
    // Spectrum uses 0.3% fee
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
    // Spectrum transaction building would require their SDK
    throw new Error(`${this.name}: Transaction building not yet implemented - requires Spectrum SDK`);
  }

  async executeSwap(assetIn, assetOut, amountIn, minimumAmountOut, walletAddress, lucid) {
    // Spectrum execution would require their SDK integration
    throw new Error(`${this.name}: Swap execution not yet implemented - requires Spectrum SDK`);
  }

  getFeeStructure() {
    return {
      tradingFee: 0.003, // 0.3%
      networkFee: 0.3, // ~0.3 ADA average
      batcherFee: 1.0 // ~1.0 ADA for Spectrum
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
    // Convert Spectrum pool format to our standard format
    return {
      id: rawPool.id || rawPool.poolId,
      assetA: rawPool.x ? {policyId: this._extractPolicyId(rawPool.x.id), tokenName: this._extractTokenName(rawPool.x.id)} : rawPool.assetA,
      assetB: rawPool.y ? {policyId: this._extractPolicyId(rawPool.y.id), tokenName: this._extractTokenName(rawPool.y.id)} : rawPool.assetB,
      reserveA: BigInt(rawPool.x?.amount || rawPool.reserveA || 0),
      reserveB: BigInt(rawPool.y?.amount || rawPool.reserveB || 0),
      fee: rawPool.poolFeeNum ? (rawPool.poolFeeNum / rawPool.poolFeeDen) : 0.003,
      dex: this.name,
      lastUpdated: Date.now(),
      // Spectrum specific fields
      version: rawPool.version || "v1",
      lpToken: rawPool.lp?.asset
    };
  }

  _extractPolicyId(assetId) {
    if (assetId === "lovelace" || assetId === "ADA") return "";
    return assetId.slice(0, 56);
  }

  _extractTokenName(assetId) {
    if (assetId === "lovelace" || assetId === "ADA") return "";
    return assetId.slice(56);
  }
}

export default SpectrumAdapter;