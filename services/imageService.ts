import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
