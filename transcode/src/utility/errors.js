// A failure that retrying can't fix (video too long, file isn't a readable video). The worker
// gives up on the first attempt instead of letting SQS redeliver it, and `message` is sent to
// the upload service as the reason the user sees — so keep it in plain words.
export class PermanentTranscodeError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PermanentTranscodeError';
  }
}
