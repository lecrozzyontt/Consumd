import { cached, invalidate } from './cache.js';

/**
 * Fetches user data and caches it using the custom cache utility.
 * @param {string} userId
 * @param {boolean} force - If true, bypasses the cache and forces a fresh fetch
 */
export async function getUserData(userId, force = false) {
  const cacheKey = `user_profile:${userId}`;
  
  return cached(
    cacheKey,
    async () => {
      // Replace this URL with your actual database or API endpoint
      const response = await fetch(`/api/users/${userId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data for user ${userId}`);
      }
      
      return response.json();
    },
    { 
      ttl: 300000,      // Cache for 5 minutes (in milliseconds)
      persist: true,    // Save to sessionStorage
      force: force      // Force refresh if requested
    } 
  );
}

/**
 * Updates user data via API and invalidates the local cache.
 * @param {string} userId 
 * @param {object} newData 
 */
export async function updateUserData(userId, newData) {
  const response = await fetch(`/api/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newData),
  });

  if (!response.ok) {
    throw new Error(`Failed to update data for user ${userId}`);
  }

  const updatedData = await response.json();

  // Invalidate the cache so the next `getUserData` call fetches fresh data
  invalidate(`user_profile:${userId}`);
  
  return updatedData;
}