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
  // if (sessionId) {
  //   // username = username.replace(/sessionid-[^-\s]+/, `sessionid-${sessionId}`);
  //   username = username.replace(/_SESSIONID_/i, sessionId);
  // }

  const proxyUrl = `http://${username}:${password}@${endpoint}`;
  const agent    = new HttpsProxyAgent(proxyUrl);
  
  // The IP check should now only run if endpoint is valid
  let ip = null;
  let city = null;
  try {
    const res = await axios.get('https://ipinfo.io/json', {
      httpsAgent: agent,
      timeout: 5000,
    });

    ip = res.data.ip;
    city = res.data.city ?? null;
    console.log(`→ [SOAX] Proxy ENDPOINT ${proxyUrl}`);
    console.log(`→ [SOAX] Proxy IP ${ip} is geolocated in ${city}`);
  } catch (err) {
    console.log(`→ [SOAX] Proxy ENDPOINT ${proxyUrl}`);
    const errorMessage = err.message || 'Unknown error';
    console.error('→ [SOAX] Failed to fetch IP info:', errorMessage);
    
    // Check for the specific error message to cancel the run
    if (errorMessage.includes('Request failed with status code 525')) {
      throw new Error(`Proxy IP info fetch failed with status code 525. Cancelling run.`);
    }
    // Re-throw other errors if they are not the specific cancellation error
    throw err;
  }

  return { username, password, endpoint, ip, city };
};
