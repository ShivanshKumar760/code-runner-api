import http from 'node:http';
import config from './config.js';
import * as db from './db.js';
import * as queue from './queue.js';
import { runCode } from './runner.js';

async function handleJob(submissionId) {
  const submission = await db.getSubmission(submissionId);
  if (!submission) return; // row expired or deleted

  await db.updateSubmission(submissionId, {
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
  });

  const result = await runCode(submission.language, submission.code);

  let status = 'COMPLETED';
  if (result.timedOut) status = 'TIMEOUT';
  else if (result.exitCode !== 0) status = 'FAILED';

  await db.updateSubmission(submissionId, {
    ...result,
    status,
    finishedAt: new Date().toISOString(),
  });
}

async function main() {
  await db.ensureTableLocal();
  const channel = await queue.connect();
  channel.prefetch(1); // ONE job at a time per worker

  await channel.consume(config.queueName, async (msg) => {
    if (!msg) return;
    const { submissionId } = JSON.parse(msg.content.toString());
    console.log(`Job ${submissionId} received`);
    try {
      await handleJob(submissionId);
    } catch (err) {
      console.error(`Job ${submissionId} crashed:`, err);
      await db
        .updateSubmission(submissionId, { status: 'ERROR', error: String(err.message) })
        .catch(() => {});
    }
    // Ack even after a crash so a "poison" job is not retried forever.
    channel.ack(msg);
  });

  // Tiny HTTP endpoint so Elastic Beanstalk can monitor the worker environment
  http.createServer((req, res) => res.end('ok')).listen(config.workerPort);
  console.log('Worker ready, waiting for jobs');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});