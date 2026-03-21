import axios from 'axios';
import { LEGACY_TRADING_HTTP_URL } from './backendConfig';
import { withRequestCache } from './requestCache';

export const LEGACY_API_URL = LEGACY_TRADING_HTTP_URL;

const legacyApi = axios.create({
  baseURL: LEGACY_API_URL,
  timeout: 30000
});

legacyApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error(`Legacy API Error: ${error.config?.url}`, error.message);
    return Promise.reject(error);
  }
);

export interface LegacyHealthStatus {
  status: string;
  database: string;
}

export async function checkLegacyHealth(force = false): Promise<boolean> {
  const key = 'legacy:health';
  if (force) {
    return legacyApi.get('/health', { timeout: 12000 }).then((response) => response.status === 200);
  }

  return withRequestCache(key, 4000, async () => {
    const response = await legacyApi.get('/health', { timeout: 12000 });
    return response.status === 200;
  });
}

export default legacyApi;
