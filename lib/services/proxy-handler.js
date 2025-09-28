// lib/proxy-handler.js
// module.exports = function getSoaxProxyAuth({ username, password, endpoint }) {
//   // we already have the full username, password & host:port
//   return { username, password, endpoint };
// };
// lib/proxy-handler.js
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

module.exports = async function getSoaxProxyAuth({ username, password, endpoint, sessionId }) {
  // console.log(`[PROXY] ${username}, ${password}, ${endpoint}, ${sessionId}`);
  username = username ?? ''; 
  password = password ?? ''; 
  endpoint = endpoint ?? '';
  
  // 🛑 EARLY EXIT CHECK: Throw an error if the proxy endpoint is missing.
  if (endpoint === '') {
    const errorMsg = 'Proxy endpoint is missing from configuration.';
    console.error(`→ [SOAX] ${errorMsg}`);
    // Throw an error that the calling function (getProfileRank) can catch.
    throw new Error(errorMsg); 
  }

  // Replace the session id placeholder if present
  if (sessionId) {
    username = username.replace(/sessionid-[^-\s]+/, `sessionid-${sessionId}`);
  }

  const proxyUrl = `http://${username}:${password}@${endpoint}`;
  const agent    = new HttpsProxyAgent(proxyUrl);
  
  // The IP check should now only run if endpoint is valid
  let ip = null;
  try {
    const res = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: agent,
      timeout:    5000,
    });
    ip = res.data.ip;
    console.log(`→ [SOAX] Using proxy IP: ${ip}`);
  } catch (err) {
    // This will now only catch actual connection errors, not config errors.
    console.error('→ [SOAX] Failed to fetch IP:', err.message);
  }

  return { username, password, endpoint, ip };
};