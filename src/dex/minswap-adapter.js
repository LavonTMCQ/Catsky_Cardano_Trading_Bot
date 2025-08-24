// Minswap DEX Adapter
import {
  ADA,
  Asset,
  BlockfrostAdapter,
  DexV2,
  DexV2Calculation,
  NetworkId,
  OrderV2,
  calculateAmountWithSlippageTolerance,
  getBackendBlockfrostLucidInstance,
} from "@minswap/sdk";
import { BlockFrostAPI } from "@blockfrost/blockfrost-js";
import { BaseDEXAdapter } from "./base-dex-adapter.js";

export class MinswapAdapter extends BaseDEXAdapter {
  constructor(networkId, blockfrostProjectId, config = {}) {
    super("Minswap", networkId, config);
    this.blockfrostProjectId = blockfrostProjectId;
    this.adapter = null;
    this.blockfrostAPI = null;
    this.dex = null;
  }

  async initialize() {
    try {
      // Initialize Blockfrost adapter
      this.blockfrostAPI = new BlockFrostAPI({
        projectId: this.blockfrostProjectId,
        network: this.networkId === NetworkId.MAINNET ? "mainnet" : "testnet"
      });
      
      // Initialize Minswap adapter
      this.adapter = new BlockfrostAdapter(this.networkId, this.blockfrostAPI);
      
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
      // Try both directions
      let pool = await this.adapter.getV2PoolByPair(assetA, assetB);
      if (!pool) {
        pool = await this.adapter.getV2PoolByPair(assetB, assetA);
      }
      
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
    const assetInIsA = this._compareAssets(assetIn, pool.assetA);
    const reserveIn = assetInIsA ? pool.reserveA : pool.reserveB;
    const reserveOut = assetInIsA ? pool.reserveB : pool.reserveA;
    const feeNumerator = assetInIsA ? pool.feeA?.[0] || 3n : pool.feeB?.[0] || 3n;

    // Calculate output using Minswap formula
    const rawOut = DexV2Calculation.calculateAmountOut({
      reserveIn,
      reserveOut,
      amountIn,
      tradingFeeNumerator: feeNumerator,
    });

    if (rawOut === 0n) {
      throw new Error("Insufficient liquidity for swap");
    }

    // Calculate slippage and fees
    const priceImpact = this.calculatePriceImpact(amountIn, reserveIn, reserveOut);
    const tradingFee = Number(feeNumerator) / 1000; // Convert to percentage

    return {
      amountOut: rawOut,
      slippage: priceImpact,
      fee: tradingFee,
      priceImpact,
      pool: pool
    };
  }

  async buildSwapTransaction(params) {
    this._ensureInitialized();
    
    const {
      sender,
      assetIn,
      assetOut,
      amountIn,
      minimumAmountOut,
      availableUtxos,
      slippagePercent = 0.5
    } = params;

    try {
      // Get pool information
      const pool = await this.getPool(assetIn, assetOut);
      if (!pool) {
        throw new Error(`No pool found for ${assetIn.toString()} / ${assetOut.toString()}`);
      }

      // Determine swap direction
      const assetInIsA = this._compareAssets(assetIn, pool.assetA);
      const direction = assetInIsA ? OrderV2.Direction.A_TO_B : OrderV2.Direction.B_TO_A;

      // Initialize Lucid instance
      const lucid = await getBackendBlockfrostLucidInstance(
        this.networkId,
        this.blockfrostProjectId,
        this.networkId === NetworkId.MAINNET 
          ? "https://cardano-mainnet.blockfrost.io/api/v0"
          : "https://cardano-testnet.blockfrost.io/api/v0",
        sender
      );

      // Create DexV2 instance
      const dex = new DexV2(lucid, this.adapter);

      // Build transaction
      const txComplete = await dex.createBulkOrdersTx({
        sender,
        availableUtxos,
        orderOptions: [{
          type: OrderV2.StepType.SWAP_EXACT_IN,
          amountIn,
          assetIn,
          direction,
          minimumAmountOut,
          lpAsset: pool.lpAsset,
          isLimitOrder: false,
          killOnFailed: false,
          slippageTolerancePercent: slippagePercent
        }],
      });

      return txComplete;
      
    } catch (error) {
      console.error(`${this.name}: Error building swap transaction:`, error);
      throw error;
    }
  }

  async executeSwap(assetIn, assetOut, amountIn, minimumAmountOut, walletAddress, lucid) {
    this._ensureInitialized();
    
    try {
      // Get pool information
      const pool = await this.getPool(assetIn, assetOut);
      if (!pool) {
        throw new Error(`No pool found for ${assetIn.toString()} / ${assetOut.toString()}`);
      }

      // Get available UTxOs
      const availableUtxos = await lucid.wallet.getUtxos();
      if (!availableUtxos || availableUtxos.length === 0) {
        throw new Error("No available UTxOs found");
      }

      // Determine swap direction
      const assetInIsA = this._compareAssets(assetIn, pool.assetA);
      const direction = assetInIsA ? OrderV2.Direction.A_TO_B : OrderV2.Direction.B_TO_A;

      // Create DexV2 instance
      const dex = new DexV2(lucid, this.adapter);

      // Build swap transaction
      const tx = await dex.createBulkOrdersTx({
        sender: walletAddress,
        availableUtxos,
        orderOptions: [{
          type: OrderV2.StepType.SWAP_EXACT_IN,
          amountIn,
          assetIn,
          direction,
          minimumAmountOut,
          lpAsset: pool.lpAsset,
          isLimitOrder: false,
          killOnFailed: false,
          slippageTolerancePercent: 0.5
        }],
      });

      // Sign and submit transaction
      const signedTx = await tx
        .addSigner(walletAddress)
        .commit(); // Use commit() instead of complete() for Minswap SDK

      const txHash = await signedTx.submit();
      
      console.log(`✅ ${this.name}: Swap submitted, txHash: ${txHash}`);
      
      return {
        txHash,
        outputAmount: minimumAmountOut // Return minimum expected, actual will be calculated later
      };
      
    } catch (error) {
      console.error(`${this.name}: Error executing swap:`, error);
      throw error;
    }
  }

  getFeeStructure() {
    return {
      tradingFee: 0.003, // 0.3%
      networkFee: 0.0003, // ~0.3 ADA average
      batcherFee: 0.7 // ~0.7 ADA for V2
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
    const totalLiquidity = adaReserve + tokenReserve; // Simplified calculation

    return {
      liquidityADA: adaReserve,
      liquidityToken: tokenReserve,
      totalLiquidity,
      pool: pool
    };
  }

  /**
   * Compare two assets for equality
   * @private
   */
  _compareAssets(asset1, asset2) {
    // Handle ADA comparison
    if (this._isADA(asset1) && this._isADA(asset2)) {
      return true;
    }
    
    // Handle token comparison
    return asset1.policyId === asset2.policyId && 
           asset1.tokenName === asset2.tokenName;
  }

  /**
   * Check if asset is ADA
   * @private
   */
  _isADA(asset) {
    return (!asset.policyId || asset.policyId === "") && 
           (!asset.tokenName || asset.tokenName === "");
  }

  /**
   * Calculate minimum amount out with slippage tolerance
   */
  calculateMinimumAmountOut(expectedAmount, slippagePercent) {
    return calculateAmountWithSlippageTolerance({
      slippageTolerancePercent: slippagePercent,
      amount: expectedAmount,
      type: "down",
    });
  }

  /**
   * Get supported token pairs
   */
  async getSupportedPairs() {
    // This would need to be implemented by querying all pools
    // For now, return empty array - would need pagination handling
    return [];
  }

  normalizePoolData(rawPool) {
    return {
      ...super.normalizePoolData(rawPool),
      feeA: rawPool.feeA,
      feeB: rawPool.feeB,
      lpAsset: rawPool.lpAsset,
      datum: rawPool.datum,
      // Minswap specific fields
      version: "v2",
      batcherAddress: rawPool.datum?.poolBatchingStakeCredential
    };
  }
}

export default MinswapAdapter;