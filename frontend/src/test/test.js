// test.js
import { PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client } from "./s3Client.js";

const bucket = "test";

async function run() {
  // upload
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: "hello.txt",
    Body: "Hello from the other side!!!",
  }));
  console.log("Uploaded hello.txt");

  // list objects
  const list = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket }));
  console.log("Bucket contents:", list.Contents?.map(o => o.Key));

  // read it back
  const obj = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: "hello.txt" }));
  const body = await obj.Body.transformToString();
  console.log("File contents:", body);
}

run().catch(console.error);