// Client-generated photo upload ids (SPEC §6 "Input validation"): the photo
// goes to uploads/{uid}/{uploadId} before createPin/updatePin is called.

export const UPLOAD_ID_LENGTH = 20
/** 64 URL- and path-safe characters, so each byte maps to one evenly. */
export const UPLOAD_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
/** Same pattern the server checks. */
export const UPLOAD_ID_PATTERN = /^[A-Za-z0-9_-]{10,40}$/

type RandomFill = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array

const cryptoFill: RandomFill = (bytes) => {
  crypto.getRandomValues(bytes)
  return bytes
}

/** 20 random characters from [A-Za-z0-9_-]. */
export function newUploadId(fill: RandomFill = cryptoFill): string {
  const bytes = fill(new Uint8Array(UPLOAD_ID_LENGTH))
  let id = ''
  for (const b of bytes) id += UPLOAD_ID_ALPHABET[b & 63]
  return id
}
