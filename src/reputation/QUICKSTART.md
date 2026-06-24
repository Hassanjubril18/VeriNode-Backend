# Reputation Service - Quick Start Guide

## 🚀 Quick Start

### 1. Initialize the Service

```typescript
import { Database } from '../config/database';
import { ReputationScoreService } from './scoreService';

// Create database connection
const db = new Database({
  host: 'localhost',
  port: 5432,
  user: 'verinode',
  password: 'your_password',
  database: 'verinode',
});

// Create service instance
const reputationService = new ReputationScoreService(db);

// Initialize schema (run once on first deployment)
await reputationService.initializeSchema();
```

### 2. Initialize a Node

```typescript
// Initialize with default score (0)
await reputationService.initializeNode('node-alice');

// Initialize with custom score
await reputationService.initializeNode('node-bob', 750);
```

### 3. Apply Rewards

```typescript
// Apply default reward (+10)
const result = await reputationService.applyReward('node-alice');
console.log(`Score: ${result.previousScore} → ${result.newScore}`);

// Apply custom reward
await reputationService.applyReward('node-bob', 50);
```

### 4. Apply Slashing

```typescript
// Apply default slashing (-500)
const result = await reputationService.applySlashing('node-alice');
console.log(`Score: ${result.previousScore} → ${result.newScore}`);
console.log(`Slash version: ${result.slashVersion}`);

// Apply custom slashing
await reputationService.applySlashing('node-bob', 200);
```

### 5. Query Reputation

```typescript
const score = await reputationService.getReputationScore('node-alice');
console.log(score);
// Output:
// {
//   nodeId: 'node-alice',
//   score: -495,
//   slashVersion: 1,
//   updatedAt: 2026-06-24T10:30:00.000Z
// }
```

## 🔥 Concurrent Operations (Race Protected!)

```typescript
// Both operations execute concurrently - NO RACE CONDITION!
// Both will be applied correctly regardless of order
await Promise.all([
  reputationService.applyReward('node-charlie', 10),
  reputationService.applySlashing('node-charlie', 500),
]);

// Result: initial_score + 10 - 500 (both applied)
```

## 📊 Common Patterns

### Pattern 1: Reward for Successful Attestation

```typescript
async function rewardSuccessfulAttestation(nodeId: string) {
  try {
    const result = await reputationService.applyReward(
      nodeId,
      ReputationScoreService.REWARD_DELTA // +10
    );
    logger.info('Attestation reward applied', {
      nodeId,
      newScore: result.newScore,
    });
  } catch (error) {
    logger.error('Failed to apply attestation reward', { nodeId, error });
  }
}
```

### Pattern 2: Slash for Proven Fraud

```typescript
async function slashForFraud(nodeId: string) {
  try {
    const result = await reputationService.applySlashing(
      nodeId,
      ReputationScoreService.SLASHING_DELTA // -500
    );
    logger.warn('Fraud slashing applied', {
      nodeId,
      newScore: result.newScore,
      slashVersion: result.slashVersion,
    });
  } catch (error) {
    logger.error('Failed to apply slashing', { nodeId, error });
  }
}
```

### Pattern 3: Batch Operations

```typescript
async function processReputationEvents(events: Event[]) {
  const operations = events.map((event) => {
    if (event.type === 'reward') {
      return reputationService.applyReward(event.nodeId, event.delta);
    } else if (event.type === 'slash') {
      return reputationService.applySlashing(event.nodeId, event.delta);
    }
  });

  // All operations execute concurrently, no race conditions!
  await Promise.all(operations);
}
```

### Pattern 4: Query with Fallback

```typescript
async function getScoreOrInitialize(nodeId: string): Promise<number> {
  let score = await reputationService.getReputationScore(nodeId);
  
  if (!score) {
    // Node doesn't exist, initialize with default score
    await reputationService.initializeNode(nodeId, 0);
    score = await reputationService.getReputationScore(nodeId);
  }
  
  return score!.score;
}
```

## 🎯 Constants

```typescript
// Available as static properties on ReputationScoreService
ReputationScoreService.REWARD_DELTA    // +10
ReputationScoreService.SLASHING_DELTA  // -500
ReputationScoreService.MIN_SCORE       // -1000
ReputationScoreService.MAX_SCORE       // +1000
```

## ⚠️ Error Handling

```typescript
try {
  await reputationService.applyReward('node-xyz', 10);
} catch (error) {
  if (error.message.includes('not found')) {
    // Node doesn't exist
    await reputationService.initializeNode('node-xyz', 0);
    await reputationService.applyReward('node-xyz', 10);
  } else {
    // Other error (database connection, etc.)
    throw error;
  }
}
```

## 📈 Monitoring Queries

### Top Reputation Nodes

```sql
SELECT node_id, score
FROM reputations
ORDER BY score DESC
LIMIT 100;
```

### Recently Slashed Nodes

```sql
SELECT node_id, score, slash_version, updated_at
FROM reputations
WHERE slash_version > 0
ORDER BY updated_at DESC
LIMIT 100;
```

### Slash Distribution

```sql
SELECT 
  slash_version,
  COUNT(*) as node_count
FROM reputations
GROUP BY slash_version
ORDER BY slash_version;
```

### Nodes Below Threshold

```sql
SELECT node_id, score, slash_version
FROM reputations
WHERE score < 0
ORDER BY score ASC;
```

## 🧪 Testing

### Run Tests

```bash
# Run all tests
npm test

# Run only reputation tests
npm run test:reputation
```

### Test Database Setup

```bash
export TEST_DB_HOST=localhost
export TEST_DB_PORT=5432
export TEST_DB_USER=verinode
export TEST_DB_PASSWORD=test_password
export TEST_DB_NAME=verinode_test
```

## 📚 More Information

- **Detailed Documentation**: See `src/reputation/README.md`
- **Examples**: See `src/reputation/example.ts`
- **Implementation Details**: See `RACE_CONDITION_FIX.md`
- **Tests**: See `tests/reputation/scoreService.test.ts`

## 🤔 FAQ

### Q: Why use atomic operations instead of transactions?

**A**: Atomic operations are simpler, faster, and eliminate the read-modify-write race condition entirely. They're the recommended approach for simple score updates.

### Q: When should I use transactional methods?

**A**: Use `applyRewardTransactional()` or `applySlashingTransactional()` when you need to combine the reputation update with other database operations in a single transaction.

### Q: What happens if two slashing events occur simultaneously?

**A**: Both will be applied correctly. PostgreSQL serializes the updates, so you'll get:
- Initial: 750
- First slash: 750 - 500 = 250
- Second slash: 250 - 500 = -250 (or -1000 if it hits the bound)
- Both slash_version increments applied

### Q: Can a reward overwrite a slashing?

**A**: No! With atomic operations, both operations are guaranteed to be applied. Neither can overwrite the other.

### Q: What if the score goes below -1000 or above 1000?

**A**: The score is capped at the bounds. Both the database (CHECK constraint) and the application logic enforce this.

### Q: How do I monitor slashing events?

**A**: Check the `slash_version` column. It increments with each slashing event. Query nodes with `slash_version > 0` to find slashed nodes.

## ✅ Checklist for Integration

- [ ] Database schema deployed (`001_create_reputations.sql`)
- [ ] Service initialized in application bootstrap
- [ ] Attestation system integrated with `applyReward()`
- [ ] Fraud detection integrated with `applySlashing()`
- [ ] Monitoring queries set up
- [ ] Tests running successfully
- [ ] Logging reviewed and verified

---

**Need Help?** Check the full documentation in `src/reputation/README.md` or review the examples in `src/reputation/example.ts`.
