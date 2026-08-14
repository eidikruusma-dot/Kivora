import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { storage, db } from '@/lib/firebase'
import { processImage } from '@/lib/processImage'

function extractStoragePathFromUrl(url: string): string | null {
  try {
    const decoded = decodeURIComponent(url)
    const match = decoded.match(/\/o\/(.+)$/)
    if (!match) return null
    const path = match[1].split('?')[0]
    return path
  } catch {
    return null
  }
}

function safeDeleteByUrl(url: string | null): void {
  if (!url) return
  const path = extractStoragePathFromUrl(url)
  if (!path) return
  deleteObject(ref(storage, path)).catch((err) => {
    console.warn('Vana profiilipildi kustutamine eba6nnestus:', err)
  })
}

export async function uploadProfilePhoto(
  uid: string,
  file: File,
  oldPhotoURL: string | null,
): Promise<string> {
  const { blob, extension } = await processImage(file)

  const timestamp = Date.now()
  const filePath = `users/${uid}/profile/avatar-${timestamp}.${extension}`
  const storageRef = ref(storage, filePath)

  await uploadBytes(storageRef, blob)

  const downloadURL = await getDownloadURL(storageRef)

  const firestoreRef = doc(db, 'users', uid)
  try {
    await updateDoc(firestoreRef, {
      photoURL: downloadURL,
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    await deleteObject(storageRef).catch(() => {})
    throw err
  }

  safeDeleteByUrl(oldPhotoURL)

  return downloadURL
}

export async function deleteProfilePhoto(
  uid: string,
  oldPhotoURL: string | null,
): Promise<void> {
  const firestoreRef = doc(db, 'users', uid)
  await updateDoc(firestoreRef, {
    photoURL: null,
    updatedAt: serverTimestamp(),
  })

  safeDeleteByUrl(oldPhotoURL)
}
