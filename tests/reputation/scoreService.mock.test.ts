/**
 * Mock-based Reputation Service Tests
 * 
 * These tests use mocked database connections for CI environments
 * where PostgreSQL may not be available. They verify the business
 * logic and race condition protection without requiring a real database.
 */

// Mock the database module before importing anything else
let mockQueryResults: any[] = [];
let mockTransactionCallback: any = null;

class MockDatabase {
  async query<T>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    if (mockQueryResults.length > 0) {
      return mockQueryResults.shift();
    }
    return { rows: [], rowCount: 0 };
  }

  async transaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
    const mockClient = {
      query: this.query.bind(this),
    };
    return await fn(mockClient);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}

  getMetrics() {
    return { totalQueries: 0, totalErrors: 0, idleCount: 10, totalCount: 20, waitingCount: 0 };
  }
}

// Mock the logger
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

jest.mock('../../src/diagnostics/logger', () => ({
  createLogger: () => mockLogger,
}));

import { ReputationScoreService } from '../../src/reputation/scoreService';

// =============================================================================
// Test Helpers
// =============================================================================

function setupMockQuery(rows: any[], rowCount?: number) {
  mockQueryResults.push({
    rows,
    rowCount: rowCount !== undefined ? rowCount : rows.length,
  });
}

function resetMocks() {
  mockQueryResults = [];
  mockTransactionCallback = null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Test Runner
// =============================================================================

async function main(): Promise<void> {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string): void {
    if (condition) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}`);
      failed++;
    }
  }

  console.log('\nReputation Score Service Tests (Mock)\n');

  // ---------------------------------------------------------------------------
  // Section 1: Service Constants
  // ---------------------------------------------------------------------------
  console.log('  Service Constants');

  assert(ReputationScoreService.REWARD_DELTA === 10, 'REWARD_DELTA is 10');
  assert(ReputationScoreService.SLASHING_DELTA === 500, 'SLASHING_DELTA is 500');
  assert(ReputationScoreService.MIN_SCORE === -1000, 'MIN_SCORE is -1000');
  assert(ReputationScoreService.MAX_SCORE === 1000, 'MAX_SCORE is 1000');

  // ---------------------------------------------------------------------------
  // Section 2: Service Initialization
  // ---------------------------------------------------------------------------
  console.log('  Service Initialization');

  resetMocks();
  const db = new MockDatabase() as any;
  const service = new ReputationScoreService(db);

  assert(service !== null, 'service created successfully');

  // ---------------------------------------------------------------------------
  // Section 3: getReputationScore
  // ---------------------------------------------------------------------------
  console.log('  getReputationScore');

  resetMocks();
  setupMockQuery([
    {
      node_id: 'test-node',
      score: 750,
      slash_version: 0,
      updated_at: new Date(),
    },
  ]);

  const score = await service.getReputationScore('test-node');
  assert(score !== null, 'getReputationScore returns non-null for existing node');
  assert(score?.nodeId === 'test-node', 'nodeId is correct');
  assert(score?.score === 750, 'score is correct');
  assert(score?.slashVersion === 0, 'slashVersion is correct');

  // Test non-existent node
  resetMocks();
  setupMockQuery([]);
  const nonExistent = await service.getReputationScore('non-existent');
  assert(nonExistent === null, 'getReputationScore returns null for non-existent node');

  // ---------------------------------------------------------------------------
  // Section 4: initializeNode
  // ---------------------------------------------------------------------------
  console.log('  initializeNode');

  resetMocks();
  setupMockQuery([], 1);
  await service.initializeNode('new-node', 100);
  assert(true, 'initializeNode completes without error');

  // ---------------------------------------------------------------------------
  // Section 5: applyReward
  // ---------------------------------------------------------------------------
  console.log('  applyReward');

  resetMocks();
  // Mock: get current score
  setupMockQuery([
    {
      node_id: 'reward-node',
      score: 100,
      slash_version: 0,
      updated_at: new Date(),
    },
  ]);
  // Mock: update score
  setupMockQuery([{ score: 110 }]);

  const rewardResult = await service.applyReward('reward-node', 10);
  assert(rewardResult.nodeId === 'reward-node', 'reward nodeId correct');
  assert(rewardResult.previousScore === 100, 'reward previousScore correct');
  assert(rewardResult.newScore === 110, 'reward newScore correct');
  assert(rewardResult.delta === 10, 'reward delta correct');

  // ---------------------------------------------------------------------------
  // Section 6: applySlashing
  // ---------------------------------------------------------------------------
  console.log('  applySlashing');

  resetMocks();
  // Mock: get current score
  setupMockQuery([
    {
      node_id: 'slash-node',
      score: 750,
      slash_version: 0,
      updated_at: new Date(),
    },
  ]);
  // Mock: update score with slash_version
  setupMockQuery([{ score: 250, slash_version: 1 }]);

  const slashResult = await service.applySlashing('slash-node', 500);
  assert(slashResult.nodeId === 'slash-node', 'slashing nodeId correct');
  assert(slashResult.previousScore === 750, 'slashing previousScore correct');
  assert(slashResult.newScore === 250, 'slashing newScore correct');
  assert(slashResult.delta === 500, 'slashing delta correct');
  assert(slashResult.slashVersion === 1, 'slashing version incremented');

  // ---------------------------------------------------------------------------
  // Section 7: Error Handling
  // ---------------------------------------------------------------------------
  console.log('  Error Handling');

  resetMocks();
  setupMockQuery([]); // No node found

  let errorCaught = false;
  try {
    await service.applyReward('non-existent-node', 10);
  } catch (err) {
    errorCaught = (err as Error).message.includes('not found');
  }
  assert(errorCaught, 'applyReward throws error for non-existent node');

  resetMocks();
  setupMockQuery([]); // No node found

  errorCaught = false;
  try {
    await service.applySlashing('non-existent-node', 100);
  } catch (err) {
    errorCaught = (err as Error).message.includes('not found');
  }
  assert(errorCaught, 'applySlashing throws error for non-existent node');

  // ---------------------------------------------------------------------------
  // Section 8: Transactional Methods
  // ---------------------------------------------------------------------------
  console.log('  Transactional Methods');

  resetMocks();
  // Mock transaction: get score
  setupMockQuery([
    {
      score: 600,
    },
  ]);
  // Mock transaction: update score
  setupMockQuery([{ score: 650 }]);

  const transRewardResult = await service.applyRewardTransactional('trans-node', 50);
  assert(transRewardResult.previousScore === 600, 'transactional reward previousScore correct');
  assert(transRewardResult.newScore === 650, 'transactional reward newScore correct');

  resetMocks();
  // Mock transaction: get score
  setupMockQuery([
    {
      score: 650,
    },
  ]);
  // Mock transaction: update score
  setupMockQuery([{ score: 450, slash_version: 1 }]);

  const transSlashResult = await service.applySlashingTransactional('trans-node', 200);
  assert(transSlashResult.previousScore === 650, 'transactional slashing previousScore correct');
  assert(transSlashResult.newScore === 450, 'transactional slashing newScore correct');
  assert(transSlashResult.slashVersion === 1, 'transactional slashing version correct');

  // ---------------------------------------------------------------------------
  // Section 9: Reward with Slash Check
  // ---------------------------------------------------------------------------
  console.log('  Reward with Slash Check');

  resetMocks();
  // Mock transaction: get score and version
  setupMockQuery([
    {
      score: 700,
      slash_version: 0,
    },
  ]);
  // Mock transaction: update with version check
  setupMockQuery([{ score: 720, slash_version: 0 }]);

  const checkRewardResult = await service.applyRewardWithSlashCheck('check-node', 20);
  assert(checkRewardResult.newScore === 720, 'reward with slash check applied correctly');

  // Test concurrent slashing detection
  resetMocks();
  // Mock transaction: get score and version
  setupMockQuery([
    {
      score: 700,
      slash_version: 0,
    },
  ]);
  // Mock transaction: update fails (version changed)
  setupMockQuery([]);

  let checkErrorCaught = false;
  try {
    await service.applyRewardWithSlashCheck('check-node-2', 20);
  } catch (err) {
    checkErrorCaught = (err as Error).message.includes('Concurrent slashing detected');
  }
  assert(checkErrorCaught, 'reward with slash check detects concurrent slashing');

  // ---------------------------------------------------------------------------
  // Section 10: Business Logic Validation
  // ---------------------------------------------------------------------------
  console.log('  Business Logic Validation');

  // Verify constants are sensible
  assert(ReputationScoreService.REWARD_DELTA > 0, 'reward delta is positive');
  assert(ReputationScoreService.SLASHING_DELTA > 0, 'slashing delta is positive');
  assert(ReputationScoreService.MIN_SCORE < 0, 'min score is negative');
  assert(ReputationScoreService.MAX_SCORE > 0, 'max score is positive');
  assert(
    ReputationScoreService.SLASHING_DELTA > ReputationScoreService.REWARD_DELTA,
    'slashing delta greater than reward delta'
  );

  // ---------------------------------------------------------------------------
  // Section 11: Concurrent Operation Simulation
  // ---------------------------------------------------------------------------
  console.log('  Concurrent Operation Simulation');

  // Test that multiple operations can be queued
  resetMocks();
  const operations: Promise<any>[] = [];

  for (let i = 0; i < 5; i++) {
    setupMockQuery([
      {
        node_id: `node-${i}`,
        score: 500,
        slash_version: 0,
        updated_at: new Date(),
      },
    ]);
    setupMockQuery([{ score: 510 }]);

    operations.push(service.applyReward(`node-${i}`, 10));
  }

  await Promise.all(operations);
  assert(operations.length === 5, 'all concurrent operations completed');

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------

  const total = passed + failed;
  console.log(`\n${total} tests: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test suite failed with error:', err);
  process.exit(1);
});
