<?php /* Template Name: Google Location Changer */ ?>
<?php get_header(); ?>

<div class="location-changer" style="font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem; background: #f5faff;">
  <h2>Google Location Changer</h2>

  <label for="keyword">Keyword</label>
  <input type="text" id="keyword" placeholder="e.g. painters near me" style="width:100%;padding:0.6rem;font-size:1rem;margin-top:0.3rem;" />

  <label for="location">Location Name</label>
  <div style="display:flex;gap:0.5rem;margin-top:0.3rem;">
    <input type="text" id="location" placeholder="e.g. Prescott, AZ, USA" style="flex:1;padding:0.6rem;font-size:1rem;" />
    <button onclick="geocodeLocation()" style="padding:0.6rem 1rem;font-size:1rem;background:#1a73e8;color:white;border:none;cursor:pointer;">Geocode</button>
  </div>
  
  <div style="margin-top: 1rem; text-align: center;">- OR -</div>

  <label for="lat">GPS Coordinates</label>
  <div style="display:flex;gap:0.5rem;margin-top:0.3rem;">
    <input type="text" id="lat" placeholder="Latitude" style="flex:1;padding:0.6rem;font-size:1rem;" />
    <input type="text" id="lng" placeholder="Longitude" style="flex:1;padding:0.6rem;font-size:1rem;" />
    <button onclick="generateUuleFromGPS()" style="padding:0.6rem 1rem;font-size:1rem;background:#1a73e8;color:white;border:none;cursor:pointer;">Use GPS</button>
  </div>
  
  <div style="display: flex; justify-content: space-between;">
    <button onclick="searchGoogle()" style="width:48%;padding:0.6rem;font-size:1rem;margin-top:2rem;background:#1a73e8;color:white;border:none;cursor:pointer;">Local Pack</button>
    <button onclick="searchGoogle(true)" style="width:48%;padding:0.6rem;font-size:1rem;margin-top:2rem;background:#1a73e8;color:white;border:none;cursor:pointer;">Local Finder</button>
  </div>
  
  <div style="display: flex; justify-content: center;">
    <button onclick="searchGoogleMaps()" style="width: 100%; padding:0.6rem;font-size:1rem;margin-top:2rem;background:#ea4335;color:white;border:none;cursor:pointer;">Google Maps Search</button>
  </div>
</div>

<script>
  let locationPayload = null;
  let lat = null;
  let lng = null;

  // Name-based UULE generation
  const register = {
    4: "E", 5: "F", 6: "G", 7: "H", 8: "I", 9: "j", 10: "K", 11: "L", 12: "M", 13: "N",
    14: "0", 15: "P", 16: "Q", 17: "R", 18: "S", 19: "T", 20: "U", 21: "V", 22: "W", 23: "X",
    24: "Y", 25: "Z", 26: "a", 27: "b", 28: "c", 29: "d", 30: "e", 31: "f", 32: "g", 33: "h",
    34: "i", 35: "j", 36: "k", 37: "l", 38: "m", 39: "n", 40: "o", 41: "p", 42: "q", 43: "r",
    44: "s", 45: "t", 46: "u", 47: "v", 48: "w", 49: "x", 50: "y", 51: "z", 52: 0, 53: 1,
    54: 2, 55: 3, 56: 4, 57: 5, 58: 6, 59: 7, 60: 8, 61: 9, 62: "-", 63: "", 64: "A", 65: "B",
    66: "C", 67: "D", 68: "E", 69: "F", 70: "G", 71: "H", 72: "I", 73: "J", 74: "K", 75: "L",
    76: "M", 77: "N", 78: "O", 79: "P", 80: "Q", 81: "R", 82: "S", 83: "T", 89: "L"
  };
  const IDENTIFIER_NAME = 'w+CAIQICI';

  function createUuleForName(locationCanonicalName) {
    const encodedLocationName = btoa(locationCanonicalName);
    const secretPart = register[locationCanonicalName.length] || '';
    return `${IDENTIFIER_NAME}${secretPart}${encodedLocationName}`;
  }

  // GPS-based UULE generation
  function createUuleForCoordinates(lat, lng, radius = 5000) {
    const IDENTIFIER_GPS = 'w+CAIQAh';
    const latStr = lat.toFixed(7);
    const lngStr = lng.toFixed(7);
    const payload = `3;${radius};${latStr};${lngStr};`;
    return `${IDENTIFIER_GPS}${btoa(payload)}`;
  }

  function geocodeLocation() {
    const input = document.getElementById('location').value.trim();
    if (!input) {
      alert('Please enter a location name.');
      return;
    }

    const apiKey = 'AIzaSyAo3iWM8Z_nk7XgCzSGKA2tRh2Ezu3TpzU';
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(input)}&key=${apiKey}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'OK') {
          const result = data.results[0];
          lat = result.geometry.location.lat;
          lng = result.geometry.location.lng;
          const canonicalName = result.formatted_address;
          locationPayload = createUuleForName(canonicalName);
          document.getElementById('location').value = canonicalName;
          alert('Location geocoded successfully!');
        } else {
          alert('Geocode failed: ' + data.status);
        }
      })
      .catch(() => {
        console.error('Error fetching geocode.');
        alert('Failed to geocode location.');
      });
  }

  function generateUuleFromGPS() {
    lat = parseFloat(document.getElementById('lat').value.trim());
    lng = parseFloat(document.getElementById('lng').value.trim());

    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid numerical GPS coordinates.');
      return;
    }
    locationPayload = createUuleForCoordinates(lat, lng);
    alert('GPS coordinates captured and UULE code generated.');
  }
  
  function encodeQuery(query) {
    return encodeURIComponent(query).replace(/%20/g, '+');
  }

  function searchGoogle(places) {
    const keyword = document.getElementById('keyword').value.trim();
    const language = 'en';
    const country = 'US';

    if (!keyword || !locationPayload) {
      alert('Please enter a keyword and generate a UULE code first.');
      return;
    }

    const q = encodeQuery(keyword);
    let url = `https://www.google.com/search?q=${q}&hl=${language}&gl=${country}&ie=utf-8&oe=utf-8&pws=0&uule=${locationPayload}`;
    if(places) {
      url = `https://www.google.com/search?q=${q}&hl=${language}&gl=${country}&ie=utf-8&oe=utf-8&pws=0&uule=${locationPayload}&tbm=lcl`;
    }
    
    window.open(url, '_blank');
  }

  function searchGoogleMaps() {
    const keyword = document.getElementById('keyword').value.trim();

    if (!keyword || lat === null || lng === null) {
      alert('Please enter a keyword and use the GPS coordinates to geocode a location first.');
      return;
    }

    const q = encodeURIComponent(keyword);
    const zoomLevel = 14; // A good default for a 5-mile radius
    const url = `https://www.google.com/maps/search/${q}/@${lat},${lng},${zoomLevel}z`;

    window.open(url, '_blank');
  }
</script>

<?php get_footer(); ?>
