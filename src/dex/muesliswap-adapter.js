// MuesliSwap DEX Adapter
import { Asset } from "@minswap/sdk";
import { BaseDEXAdapter } from "./base-dex-adapter.js";

export class MuesliSwapAdapter extends BaseDEXAdapter {
  constructor(networkId, blockfrostProjectId, config = {}) {
    super("MuesliSwap", networkId, config);
    this.blockfrostProjectId = blockfrostProjectId;
    this.apiBaseUrl = "https://api.muesliswap.com";
  }

  async initialize() {
    try {
      // Test API connectivity with real endpoint
      const response = await fetch(`${this.apiBaseUrl}/liquidity/pools`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`MuesliSwap API returned ${response.status}`);
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
      const response = await fetch(`${this.apiBaseUrl}/liquidity/pools`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`MuesliSwap API returned ${response.status}`);
      }
      
      const pools = await response.json();
      
      // Find pool for the asset pair
      const assetAStr = this._assetToString(assetA);
      const assetBStr = this._assetToString(assetB);
      
      const pool = pools.find(p => 
        (this._assetToString({policyId: p.tokenA.address.policyId, tokenName: p.tokenA.address.name}) === assetAStr && 
         this._assetToString({policyId: p.tokenB.address.policyId, tokenName: p.tokenB.address.name}) === assetBStr) ||
        (this._assetToString({policyId: p.tokenA.address.policyId, tokenName: p.tokenA.address.name}) === assetBStr && 
         this._assetToString({policyId: p.tokenB.address.policyId, tokenName: p.tokenB.address.name}) === assetAStr)
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
    
    // MuesliSwap uses 0.3% fee
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
    // MuesliSwap transaction building would require their SDK
    // For now, throw error - this would need MuesliSwap SDK integration
    throw new Error(`${this.name}: Transaction building not yet implemented - requires MuesliSwap SDK`);
  }

  async executeSwap(assetIn, assetOut, amountIn, minimumAmountOut, walletAddress, lucid) {
    // MuesliSwap execution would require their SDK integration
    throw new Error(`${this.name}: Swap execution not yet implemented - requires MuesliSwap SDK`);
  }

  getFeeStructure() {
    return {
      tradingFee: 0.003, // 0.3%
      networkFee: 0.3, // ~0.3 ADA average
      batcherFee: 1.0 // ~1.0 ADA for MuesliSwap
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
    // Convert MuesliSwap pool format to our standard format
    return {
      id: rawPool.poolId,
      assetA: {policyId: rawPool.tokenA.address.policyId, tokenName: rawPool.tokenA.address.name},
      assetB: {policyId: rawPool.tokenB.address.policyId, tokenName: rawPool.tokenB.address.name},
      reserveA: BigInt(rawPool.tokenA.amount || 0),
      reserveB: BigInt(rawPool.tokenB.amount || 0),
      fee: parseFloat(rawPool.poolFee) || 0.003,
      dex: this.name,
      lastUpdated: Date.now(),
      // MuesliSwap specific fields
      version: rawPool.provider || "muesliswap",
      lpToken: rawPool.lpToken,
      volume24h: rawPool.volume24h,
      liquidityApy: rawPool.liquidityApy
    };
  }
}

export default MuesliSwapAdapter;