// One-off backfill: re-sends { videoId, key } to the transcode queue for every job missing one
// of the configured outputs (e.g. old AV1-only jobs that now also need H.264). The worker then
// encodes only what's missing — outputs already in transcode_jobs.outputs are skipped.
//
//   node scripts/requeue.js <videoId> ...   # only these jobs
//   node scripts/requeue.js --all           # every job missing an output
//   node scripts/requeue.js                 # list jobs missing an output, queue nothing
//
// Prefer explicit ids: transcode_jobs keeps rows for videos the upload service may have deleted,
// and --all would re-encode those too.
import 'dotenv/config';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import db from '../src/config/configDB.js';
import { sqsClient, TRANSCODE_QUEUE_URL } from '../src/config/sqsConfig.js';
import { missingOutputs } from '../src/services/transcodeService.js';

if (!TRANSCODE_QUEUE_URL) {
  console.error('TRANSCODE_QUEUE_URL not set');
  process.exit(1);
}

const args = process.argv.slice(2);
const all = args.includes('--all');
const ids = args.filter((arg) => arg !== '--all');
const { rows } = ids.length
  ? await db.query('SELECT * FROM transcode_jobs WHERE video_id = ANY($1)', [ids])
  : await db.query('SELECT * FROM transcode_jobs ORDER BY created_at');
const dryRun = !all && ids.length === 0;

let queued = 0;
for (const job of rows) {
  const missing = missingOutputs(job).map((settings) => settings.name);
  if (missing.length === 0) continue;
  if (dryRun) {
    console.log(`${job.video_id} (${job.status}) missing: ${missing.join(', ')}`);
    continue;
  }

  await sqsClient.send(new SendMessageCommand({
    QueueUrl: TRANSCODE_QUEUE_URL,
    MessageBody: JSON.stringify({ videoId: job.video_id, key: job.source_key }),
  }));
  console.log(`queued ${job.video_id} (missing: ${missing.join(', ')})`);
  queued++;
}

console.log(dryRun ? 'Nothing queued — pass video ids, or --all' : `${queued} job(s) queued`);
await db.end();
