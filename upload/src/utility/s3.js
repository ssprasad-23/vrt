import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT, // MinIO: e.g. http://localhost:9000
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // required for MinIO — it doesn't support virtual-hosted-style addressing
});

const UPLOAD_URL_EXPIRY_SECONDS = Number(process.env.UPLOAD_URL_EXPIRY_SECONDS) || 900; // 15 min

// access token uses { userId: user.user_id, email: user.email }


//Builds the S3 object key for a video's original upload, one folder per video
//(same layout as the media bucket's {videoId}/av1.mp4): original bucket > {videoId}/{videoId}_original.mp4.
//videoId repeated in the filename so the file stays identifiable if copied out of its folder.
export function buildVideoKey(videoId) {
  return `${videoId}/${videoId}_original.mp4`;
}

//working
// Generates a pre-signed S3 URL that allows a client to upload a file
// directly to S3 (via PUT request) without routing the file through
// our own server, and without exposing AWS credentials to the client.
export async function generateUploadUrl(key, contentType) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
  });

  console.log(`Presigned upload URL created for key: ${key} ${new Date().toLocaleTimeString()}`);
  return uploadUrl;
}