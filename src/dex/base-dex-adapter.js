// Base DEX Adapter - Abstract interface for all DEX integrations
import { Asset } from "@minswap/sdk";

export class BaseDEXAdapter {
  constructor(name, networkId, config = {}) {
    this.name = name;
    this.networkId = networkId;
    this.config = config;
    this.isInitialized = false;
  }

  /**
   * Initialize the DEX adapter
   * Must be implemented by each DEX
   */
  async initialize() {
    throw new Error(`${this.name}: initialize() must be implemented`);
  }

  /**
   * Get pool information for a token pair
   * @param {Asset} assetA - First asset
   * @param {Asset} assetB - Second asset
   * @returns {Promise<Pool>} Pool information
   */
  async getPool(assetA, assetB) {
    throw new Error(`${this.name}: getPool() must be implemented`);
  }

  /**
   * Get current price for a token pair
   * @param {Asset} assetA - Base asset
   * @param {Asset} assetB - Quote asset
   * @returns {Promise<{price: number, reserves: {reserveA: bigint, reserveB: bigint}}>}
   */
  async getPrice(assetA, assetB) {
    throw new Error(`${this.name}: getPrice() must be implemented`);
  }

  /**
   * Calculate expected output for a swap
   * @param {Asset} assetIn - Input asset
   * @param {Asset} assetOut - Output asset
   * @param {bigint} amountIn - Input amount
   * @returns {Promise<{amountOut: bigint, slippage: number, fee: number}>}
   */
  async calculateSwapOutput(assetIn, assetOut, amountIn) {
    throw new Error(`${this.name}: calculateSwapOutput() must be implemented`);
  }

  /**
   * Build swap transaction
   * @param {Object} params - Swap parameters
   * @param {string} params.sender - Sender address
   * @param {Asset} params.assetIn - Input asset
   * @param {Asset} params.assetOut - Output asset
   * @param {bigint} params.amountIn - Input amount
   * @param {bigint} params.minimumAmountOut - Minimum output amount
   * @param {Array} params.availableUtxos - Available UTxOs
   * @returns {Promise<Transaction>} Built transaction
   */
  async buildSwapTransaction(params) {
    throw new Error(`${this.name}: buildSwapTransaction() must be implemented`);
  }

  /**
   * Execute a swap transaction on this DEX
   * @param {Asset} assetIn - Input asset
   * @param {Asset} assetOut - Output asset
   * @param {bigint} amountIn - Input amount
   * @param {bigint} minimumAmountOut - Minimum expected output
   * @param {string} walletAddress - Wallet address
   * @param {Object} lucid - Lucid instance
   * @returns {Promise<{txHash: string, outputAmount: bigint}>}
   */
  async executeSwap(assetIn, assetOut, amountIn, minimumAmountOut, walletAddress, lucid) {
    throw new Error(`${this.name}: executeSwap() must be implemented`);
  }

  /**
   * Get DEX-specific fee structure
   * @returns {{tradingFee: number, networkFee: number}}
   */
  getFeeStructure() {
    throw new Error(`${this.name}: getFeeStructure() must be implemented`);
  }

  /**
   * Get liquidity for a pool
   * @param {Asset} assetA 
   * @param {Asset} assetB 
   * @returns {Promise<{liquidityADA: bigint, liquidityToken: bigint, totalLiquidity: bigint}>}
   */
  async getPoolLiquidity(assetA, assetB) {
    throw new Error(`${this.name}: getPoolLiquidity() must be implemented`);
  }

  /**
   * Check if DEX supports a token pair
   * @param {Asset} assetA 
   * @param {Asset} assetB 
   * @returns {Promise<boolean>}
   */
  async supportsTokenPair(assetA, assetB) {
    const pool = await this.getPool(assetA, assetB);
    return pool !== null;
  }

  /**
   * Validate that the adapter is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error(`${this.name}: Adapter not initialized. Call initialize() first.`);
    }
  }

  /**
   * Create asset from token definition
   * @param {Object} token - Token definition with policyId and tokenName
   * @returns {Asset}
   */
  static createAsset(token) {
    if (!token.policyId && !token.tokenName) {
      // ADA
      return Asset.fromString("lovelace");
    }
    return Asset.fromString(`${token.policyId}.${token.tokenName}`);
  }

  /**
   * Normalize pool data to common format
   * @param {Object} rawPool - Raw pool data from DEX
   * @returns {Object} Normalized pool data
   */
  normalizePoolData(rawPool) {
    return {
      id: rawPool.id || rawPool.poolId,
      assetA: rawPool.assetA || rawPool.tokenA,
      assetB: rawPool.assetB || rawPool.tokenB,
      reserveA: rawPool.reserveA || rawPool.reserveTokenA,
      reserveB: rawPool.reserveB || rawPool.reserveTokenB,
      fee: rawPool.fee || rawPool.tradingFee,
      dex: this.name,
      lastUpdated: Date.now()
    };
  }

  /**
   * Calculate price impact for a swap
   * @param {bigint} amountIn 
   * @param {bigint} reserveIn 
   * @param {bigint} reserveOut 
   * @returns {number} Price impact as percentage
   */
  calculatePriceImpact(amountIn, reserveIn, reserveOut) {
    const amountInFloat = Number(amountIn);
    const reserveInFloat = Number(reserveIn);
    const reserveOutFloat = Number(reserveOut);
    
    const priceWithoutImpact = reserveOutFloat / reserveInFloat;
    const amountOut = (amountInFloat * reserveOutFloat) / (reserveInFloat + amountInFloat);
    const priceWithImpact = amountOut / amountInFloat;
    
    return ((priceWithoutImpact - priceWithImpact) / priceWithoutImpact) * 100;
  }

  /**
   * Get human-readable name for the DEX
   */
  toString() {
    return this.name;
  }
}

export default BaseDEXAdapter;