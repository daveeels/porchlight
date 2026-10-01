// Photo upload to uploads/{uid}/{uploadId} (SPEC §5 "Storage layout"). The
// server reads it in createPin/updatePin, cleans it with sharp and deletes it.
import { ref, uploadBytesResumable } from 'firebase/storage'
import { storage } from './firebase'

/** Uploads a prepared JPEG. `onProgress` gets 0..1. */
export function uploadPhoto(
  uid: string,
  uploadId: string,
  jpeg: Blob,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const task = uploadBytesResumable(ref(storage, `uploads/${uid}/${uploadId}`), jpeg, {
    contentType: 'image/jpeg',
  })
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        if (onProgress && snap.totalBytes > 0) onProgress(snap.bytesTransferred / snap.totalBytes)
      },
      reject,
      () => {
        onProgress?.(1)
        resolve()
      },
    )
  })
}
