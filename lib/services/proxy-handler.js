// lib/proxy-handler.js
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { note } = require('../utils/note');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = async function getSoaxProxyAuth({ 
  res_username, 
  res_password, 
  endpoint, 
  sessionId,
  maxRetries = 3 
}) {
  note(`[PROXY] using Res IP ${res_username}`);
  const username = res_username ?? ''; 
  const password = res_password ?? ''; 
  endpoint = endpoint ?? '';
  
  // 🛑 EARLY EXIT CHECK: Throw an error if the proxy endpoint is missing.
  if (endpoint === '') {
    const errorMsg = 'Proxy endpoint is missing from configuration.';
    note(`→ [SOAX] ${errorMsg}`);
    throw new Error(errorMsg); 
  }

  const proxyUrl = `http://${username}:${password}@${endpoint}`;
  const agent = new HttpsProxyAgent(proxyUrl);
  
  // Retry logic for IP check
  let ip = null;
  let city = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`→ [SOAX] Proxy IP check attempt ${attempt}/${maxRetries}...`);
      
      const res = await axios.get('https://ipinfo.io/json', {
        httpsAgent: agent,
        timeout: 5000,
      });

      ip = res.data.ip;
      city = res.data.city ?? null;
      console.log(`→ [SOAX] Proxy ENDPOINT ${proxyUrl}`);
      note(`→ [SOAX] Proxy IP ${ip} is geolocated in ${city}`);
      
      // Success - break out of retry loop
      break;
      
    } catch (err) {
      lastError = err;
      const errorMessage = err.message || 'Unknown error';
      console.error(`→ [SOAX] IP info fetch attempt ${attempt}/${maxRetries} failed: ${errorMessage}`);
      
      // Check for fatal errors that shouldn't be retried
      if (errorMessage.includes('Request failed with status code 525')) {
        console.error('→ [SOAX] Status 525 - SSL handshake failed. This proxy is likely blocked.');
        throw new Error(`Proxy blocked (status 525). Cancelling run.`);
      }
      
      // Check for proxy authentication errors
      if (errorMessage.includes('407') || errorMessage.includes('Proxy Authentication Required')) {
        console.error(`→ [SOAX] Proxy authentication failed.  ${username} / ${password}`);
        throw new Error(`Proxy authentication failed. Check credentials.`);
      }
      
      // If this was the last attempt, throw the error
      if (attempt >= maxRetries) {
        console.error(`→ [SOAX] All ${maxRetries} attempts failed. Giving up.`);
        throw new Error(`Failed to verify proxy after ${maxRetries} attempts: ${errorMessage}`);
      }
      
      // Wait before retrying (exponential backoff)
      const waitMs = 1000 * attempt;
      console.log(`→ [SOAX] Waiting ${waitMs}ms before retry...`);
      await delay(waitMs);
    }
  }

  // If we still don't have an IP after retries (shouldn't happen, but safety check)
  if (!ip) {
    console.warn('→ [SOAX] Warning: IP verification failed, but continuing anyway...');
    // You can choose to throw here or continue without IP info
    // For now, continuing with null IP
  }

  return { username, password, endpoint, ip, city };
};