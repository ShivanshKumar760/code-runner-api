import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import config from './config.js';

const client = new DynamoDBClient({
  region: config.region,
  // Only set locally -> points the SDK at DynamoDB Local
  ...(config.dynamoEndpoint && { endpoint: config.dynamoEndpoint }),
});
// The "Document" client lets us use plain JS objects instead of {S: "..."} types
const doc = DynamoDBDocumentClient.from(client);
const TableName = config.tableName;

// On AWS the table comes from CloudFormation. Locally we create it ourselves.
export async function ensureTableLocal() {
  if (!config.dynamoEndpoint) return;
  try {
    await client.send(new DescribeTableCommand({ TableName }));
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
    await client.send(
      new CreateTableCommand({
        TableName,
        AttributeDefinitions: [{ AttributeName: 'submissionId', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'submissionId', KeyType: 'HASH' }],
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );
    console.log(`Created local table ${TableName}`);
  }
}

export async function createSubmission(item) {
  await doc.send(
    new PutCommand({
      TableName,
      Item: {
        ...item,
        // DynamoDB TTL: the row is auto-deleted after 7 days (epoch seconds)
        expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      },
    }),
  );
}

export async function getSubmission(submissionId) {
  const res = await doc.send(new GetCommand({ TableName, Key: { submissionId } }));
  return res.Item; // undefined if not found
}

// updateSubmission(id, { status: 'RUNNING' }) builds the SET expression for us.
// Names are aliased (#k0) because words like "status" are reserved in DynamoDB.
export async function updateSubmission(submissionId, fields) {
  const keys = Object.keys(fields);
  await doc.send(
    new UpdateCommand({
      TableName,
      Key: { submissionId },
      UpdateExpression: 'SET ' + keys.map((_, i) => `#k${i} = :v${i}`).join(', '),
      ExpressionAttributeNames: Object.fromEntries(keys.map((k, i) => [`#k${i}`, k])),
      ExpressionAttributeValues: Object.fromEntries(keys.map((k, i) => [`:v${i}`, fields[k]])),
    }),
  );
}