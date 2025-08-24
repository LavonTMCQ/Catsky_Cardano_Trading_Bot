// Simple JSON-based database for storing trading data
import fs from 'fs/promises';
import path from 'path';

export class JSONDatabase {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.initialized = false;
  }

  async initialize() {
    try {
      // Create data directory if it doesn't exist
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Initialize empty files if they don't exist
      const files = [
        'price_history.json',
        'trades.json', 
        'positions.json',
        'performance_metrics.json',
        'arbitrage_opportunities.json',
        'arbitrage_executions.json'
      ];

      for (const file of files) {
        const filePath = path.join(this.dataDir, file);
        try {
          await fs.access(filePath);
        } catch {
          // File doesn't exist, create it with empty array
          await fs.writeFile(filePath, JSON.stringify([], null, 2));
        }
      }

      this.initialized = true;
      console.log('✅ JSON Database initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize JSON Database:', error);
      throw error;
    }
  }

  async insert(table, data) {
    this._ensureInitialized();
    
    try {
      const filePath = path.join(this.dataDir, `${table}.json`);
      const existingData = await this.select(table);
      
      // Add timestamp if not present
      const record = {
        id: this._generateId(),
        timestamp: Date.now(),
        ...data
      };

      existingData.push(record);
      
      await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));
      return record;
    } catch (error) {
      console.error(`Error inserting data into ${table}:`, error);
      throw error;
    }
  }

  async insertMany(table, dataArray) {
    this._ensureInitialized();
    
    try {
      const filePath = path.join(this.dataDir, `${table}.json`);
      const existingData = await this.select(table);
      
      const records = dataArray.map(data => ({
        id: this._generateId(),
        timestamp: Date.now(),
        ...data
      }));

      existingData.push(...records);
      
      await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));
      return records;
    } catch (error) {
      console.error(`Error inserting batch data into ${table}:`, error);
      throw error;
    }
  }

  async select(table, filter = null, limit = null) {
    this._ensureInitialized();
    
    try {
      const filePath = path.join(this.dataDir, `${table}.json`);
      const fileContent = await fs.readFile(filePath, 'utf8');
      let data = JSON.parse(fileContent);

      // Apply filter if provided
      if (filter) {
        data = data.filter(filter);
      }

      // Apply limit if provided
      if (limit) {
        data = data.slice(-limit); // Get last N records
      }

      return data;
    } catch (error) {
      console.error(`Error selecting data from ${table}:`, error);
      return [];
    }
  }

  async selectLatest(table, count = 1) {
    const data = await this.select(table);
    return data.slice(-count);
  }

  async selectByTimeRange(table, startTime, endTime = Date.now()) {
    return await this.select(table, record => 
      record.timestamp >= startTime && record.timestamp <= endTime
    );
  }

  async deleteOlderThan(table, maxAge = 7 * 24 * 60 * 60 * 1000) { // Default: 7 days
    this._ensureInitialized();
    
    try {
      const cutoffTime = Date.now() - maxAge;
      const data = await this.select(table);
      const filteredData = data.filter(record => record.timestamp > cutoffTime);
      
      const filePath = path.join(this.dataDir, `${table}.json`);
      await fs.writeFile(filePath, JSON.stringify(filteredData, null, 2));
      
      const deletedCount = data.length - filteredData.length;
      console.log(`🗑️ Cleaned ${deletedCount} old records from ${table}`);
      
      return deletedCount;
    } catch (error) {
      console.error(`Error cleaning old data from ${table}:`, error);
      throw error;
    }
  }

  async update(table, filter, updateData) {
    this._ensureInitialized();
    
    try {
      const filePath = path.join(this.dataDir, `${table}.json`);
      const data = await this.select(table);
      
      let updatedCount = 0;
      const updatedData = data.map(record => {
        if (filter(record)) {
          updatedCount++;
          return { ...record, ...updateData, updated_at: Date.now() };
        }
        return record;
      });

      await fs.writeFile(filePath, JSON.stringify(updatedData, null, 2));
      return updatedCount;
    } catch (error) {
      console.error(`Error updating data in ${table}:`, error);
      throw error;
    }
  }

  async getTableStats(table) {
    const data = await this.select(table);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    return {
      totalRecords: data.length,
      todayRecords: data.filter(r => r.timestamp > now - oneDay).length,
      oldestRecord: data.length > 0 ? new Date(Math.min(...data.map(r => r.timestamp))) : null,
      newestRecord: data.length > 0 ? new Date(Math.max(...data.map(r => r.timestamp))) : null,
      fileSizeKB: 0 // Could calculate actual file size if needed
    };
  }

  async getAllStats() {
    const tables = [
      'price_history',
      'trades', 
      'positions',
      'performance_metrics',
      'arbitrage_opportunities'
    ];

    const stats = {};
    for (const table of tables) {
      try {
        stats[table] = await this.getTableStats(table);
      } catch (error) {
        stats[table] = { error: error.message };
      }
    }

    return stats;
  }

  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  _ensureInitialized() {
    if (!this.initialized) {
      throw new Error('JSONDatabase not initialized. Call initialize() first.');
    }
  }
}

export default JSONDatabase;