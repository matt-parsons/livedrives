/**
 * Randomly pick one keyword from the weighted list.
 * @param {Array<{term: string, weight: number}>} keywords
 * @returns {string} the chosen search term
 */
function pickKeyword(keywords) {
  const total = keywords.reduce((sum, k) => sum + k.weight, 0);
  let rand = Math.random() * total;

  for (const { term, weight } of keywords) {
    if (rand < weight) {
      return term;
    }
    rand -= weight;
  }
  // Fallback
  return keywords[0].term;
}

module.exports = { pickKeyword };
