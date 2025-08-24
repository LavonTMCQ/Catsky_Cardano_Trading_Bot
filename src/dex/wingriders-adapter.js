// WingRiders DEX Adapter
import { Asset } from "@minswap/sdk";
import { BaseDEXAdapter } from "./base-dex-adapter.js";

export class WingRidersAdapter extends BaseDEXAdapter {
  constructor(networkId, blockfrostProjectId, config = {}) {
    super("WingRiders", networkId, config);
    this.blockfrostProjectId = blockfrostProjectId;
    // WingRiders doesn't have a public API, we'll need to use DexHunter or on-chain data
    this.dexHunterUrl = "https://api-us.dexhunterv3.app";
  }

  async initialize() {
    try {
      // Since WingRiders doesn't have a public API, we'll mark it as initialized
      // and rely on DexHunter aggregator or on-chain data
      this.isInitialized = true;
      console.log(`✅ ${this.name} adapter initialized (via DexHunter aggregator)`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to initialize ${this.name} adapter:`, error);
      throw error;
    }
  }

  async getPool(assetA, assetB) {
    this._ensureInitialized();
    
    try {
      // Try to get pool data from DexHunter
      const assetAStr = this._assetToString(assetA);
      const assetBStr = this._assetToString(assetB);
      
      const response = await fetch(`${this.dexHunterUrl}/stats/pools/${assetAStr}/${assetBStr}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        return null;
      }
      
      const poolData = await response.json();
      
      // Filter for WingRiders pools
      const wingRidersPool = poolData.find(p => 
        p.dex === "WINGRIDER" || p.dex === "WINGRIDERV2"
      );
      
      if (wingRidersPool) {
        return this.normalizePoolData(wingRidersPool);
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
    
    // WingRiders uses 0.35% fee
    const fee = 0.0035;
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
    // WingRiders transaction building would require their SDK or DexHunter API
    throw new Error(`${this.name}: Transaction building requires DexHunter API integration`);
  }

  async executeSwap(assetIn, assetOut, amountIn, minimumAmountOut, walletAddress, lucid) {
    // WingRiders execution would require DexHunter API
    throw new Error(`${this.name}: Swap execution requires DexHunter API integration`);
  }

  getFeeStructure() {
    return {
      tradingFee: 0.0035, // 0.35%
      networkFee: 0.3, // ~0.3 ADA average
      batcherFee: 2.0 // ~2.0 ADA for WingRiders
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
    // Convert DexHunter/WingRiders pool format to our standard format
    return {
      id: rawPool.pool_id || rawPool.poolId,
      assetA: rawPool.tokenA || rawPool.token_in,
      assetB: rawPool.tokenB || rawPool.token_out,
      reserveA: BigInt(rawPool.liquidity_a || rawPool.reserveA || 0),
      reserveB: BigInt(rawPool.liquidity_b || rawPool.reserveB || 0),
      fee: rawPool.pool_fee || 0.0035,
      dex: this.name,
      lastUpdated: Date.now(),
      // WingRiders specific fields
      version: rawPool.dex || "WINGRIDER",
      lpToken: rawPool.lp_token
    };
  }
}

export default WingRidersAdapter;