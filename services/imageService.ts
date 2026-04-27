import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from 'firebase/storage';

const extensionForMime = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/svg+xml') return 'svg';
  return 'bin';
};

const stripDataUrlPrefix = (base64Data: string): string => {
  const match = base64Data.match(/^data:[^,]+,(.+)$/i);
  return (match ? match[1] : base64Data).replace(/\s+/g, '');
};

const base64ToBlob = (base64Data: string, mimeType: string): Blob => {
  const cleanBase64 = stripDataUrlPrefix(base64Data);
  const binary = atob(cleanBase64);
  const chunkSize = 8192;
  const chunks: Uint8Array[] = [];

  for (let offset = 0; offset < binary.length; offset += chunkSize) {
    const slice = binary.slice(offset, offset + chunkSize);
    const bytes = new Uint8Array(slice.length);
    for (let i = 0; i < slice.length; i += 1) {
      bytes[i] = slice.charCodeAt(i);
    }
    chunks.push(bytes);
  }

  return new Blob(chunks, { type: mimeType });
};

export interface UploadedGenerationImage {
  path: string;
  downloadUrl: string;
  size: number;
}

export const uploadProfileImage = async (file: File, userId: string): Promise<string> => {
  // Validate file type
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload an image file (JPEG, PNG, etc.)');
  }

  // Validate file size (max 2MB for profile photos)
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Image size must be less than 2MB');
  }

  try {
    // Create a storage reference: users/{userId}/profile.jpg
    // We use a fixed name so it overwrites the old one automatically
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const storageRef = ref(storage, `users/${userId}/profile.${fileExtension}`);

    // Upload the file
    // Add a timeout to preventing hanging if storage is unreachable
    const uploadPromise = uploadBytes(storageRef, file);
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Upload timed out. Check your network or storage config.")), 15000)
    );
    
    await Promise.race([uploadPromise, timeoutPromise]);

    // Get the download URL
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error: any) {
    console.error("Error uploading image:", error);
    if (error.code === 'storage/unauthorized') {
      throw new Error("Permission denied. Please check your Storage Security Rules.");
    } else if (error.code === 'storage/canceled') {
      throw new Error("Upload canceled.");
    } else if (error.code === 'storage/unknown') {
       throw new Error("Unknown error occurred, inspect error.serverResponse");
    }
    throw new Error(error.message || "Failed to upload image. Please try again.");
  }
};

export const uploadGenerationImage = async ({
  userId,
  generationId,
  versionId,
  base64Data,
  mimeType,
}: {
  userId: string;
  generationId: string;
  versionId: string;
  base64Data: string;
  mimeType: string;
}): Promise<UploadedGenerationImage> => {
  if (!base64Data?.trim()) {
    throw new Error('No image data available to upload.');
  }

  const safeMimeType = mimeType || 'image/webp';
  const extension = extensionForMime(safeMimeType);
  const path = `users/${userId}/history/${generationId}/${versionId}.${extension}`;
  const blob = base64ToBlob(base64Data, safeMimeType);
  const storageRef = ref(storage, path);

  try {
    await uploadBytes(storageRef, blob, {
      contentType: safeMimeType,
      customMetadata: {
        generationId,
        versionId,
      },
    });
    const downloadUrl = await getDownloadURL(storageRef);
    return { path, downloadUrl, size: blob.size };
  } catch (error: any) {
    console.error('Error uploading generation image:', error);
    if (error.code === 'storage/unauthorized') {
      throw new Error('Permission denied syncing generated image. Please check your Storage Security Rules.');
    }
    throw new Error(error.message || 'Failed to sync generated image to cloud storage.');
  }
};

export const deleteGenerationImages = async (userId: string, generationId: string): Promise<void> => {
  try {
    const folderRef = ref(storage, `users/${userId}/history/${generationId}`);
    const listed = await listAll(folderRef);
    await Promise.all(
      listed.items.map((itemRef) =>
        deleteObject(itemRef).catch((error) => {
          console.warn('Failed to delete generated image from storage:', itemRef.fullPath, error);
        })
      )
    );
  } catch (error) {
    console.warn('Failed to list generated images for deletion:', error);
  }
};
