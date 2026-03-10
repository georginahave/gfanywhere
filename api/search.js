export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { location, keyword, keywords } = req.query;
  if (!location) return res.status(400).json({ error: 'Location is required' });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  // Helper: fetch all pages for a single text search query (up to 60 results)
  async function fetchAllPages(query) {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=restaurant&key=${apiKey}`;
    const searchRes = await fetch(url);
    const searchData = await searchRes.json();
    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') return [];

    let places = searchData.results || [];
    let nextToken = searchData.next_page_token;

    for (let page = 2; page <= 3 && nextToken; page++) {
      await new Promise(r => setTimeout(r, 2000));
      const pageUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?pagetoken=${nextToken}&key=${apiKey}`;
      const pageRes = await fetch(pageUrl);
      const pageData = await pageRes.json();
      if (pageData.status === 'OK' && pageData.results) {
        places = places.concat(pageData.results);
      }
      nextToken = pageData.next_page_token;
    }
    return places;
  }

  try {
    // Step 1: Build search queries — one per keyword for OR logic
    // "keywords" param = comma-separated list for OR searches
    // "keyword" param = legacy single keyword (cuisine type from text input)
    const kwList = keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean) : [];
    const cuisineKw = keyword || '';

    let allPlaces = [];
    const seenPlaceIds = new Set();

    // Track which keyword searches returned each restaurant
    const placeKeywordSources = {};

    if (kwList.length > 0) {
      // Run a separate search for EACH keyword (OR logic)
      const searches = kwList.map(kw => {
        const q = cuisineKw ? `${kw} ${cuisineKw} restaurants in ${location}` : `${kw} restaurants in ${location}`;
        return fetchAllPages(q).then(places => ({ kw, places }));
      });
      const results = await Promise.all(searches);
      for (const { kw, places } of results) {
        for (const p of places) {
          // Tag this place with the keyword that found it
          if (!placeKeywordSources[p.place_id]) placeKeywordSources[p.place_id] = [];
          if (!placeKeywordSources[p.place_id].includes(kw)) placeKeywordSources[p.place_id].push(kw);
          if (!seenPlaceIds.has(p.place_id)) {
            seenPlaceIds.add(p.place_id);
            allPlaces.push(p);
          }
        }
      }
    } else if (cuisineKw) {
      allPlaces = await fetchAllPages(`${cuisineKw} restaurants in ${location}`);
    } else {
      allPlaces = await fetchAllPages(`restaurants in ${location}`);
    }

    // Step 2: Get details + reviews for each unique place (in parallel batches of 10)
    const batchSize = 10;
    const detailed = [];

    for (let i = 0; i < allPlaces.length; i += batchSize) {
      const batch = allPlaces.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(async (place) => {
        try {
          const fields = 'name,rating,user_ratings_total,formatted_address,photos,reviews,price_level,opening_hours,website,formatted_phone_number,geometry,editorial_summary,types';
          const [relevantRes, newestRes] = await Promise.all([
            fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=${fields}&reviews_sort=most_relevant&key=${apiKey}`),
            fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=reviews&reviews_sort=newest&key=${apiKey}`),
          ]);

          const relevantData = await relevantRes.json();
          const newestData = await newestRes.json();
          const d = relevantData.result || {};
          const relevantReviews = d.reviews || [];
          const newestReviews = (newestData.result || {}).reviews || [];

          // Merge & deduplicate reviews from both sorts
          const seenAuthors = new Set();
          const allReviews = [];
          for (const rv of [...relevantReviews, ...newestReviews]) {
            const key = `${rv.author_name}::${rv.time}`;
            if (!seenAuthors.has(key)) {
              seenAuthors.add(key);
              allReviews.push({
                author: rv.author_name,
                rating: rv.rating,
                text: rv.text,
                time: rv.relative_time_description,
                profile_photo: rv.profile_photo_url,
              });
            }
          }

          return {
            place_id: place.place_id,
            name: d.name || place.name,
            rating: d.rating || place.rating,
            user_ratings_total: d.user_ratings_total || place.user_ratings_total,
            address: d.formatted_address || place.formatted_address,
            price_level: d.price_level,
            is_open: d.opening_hours?.open_now,
            website: d.website,
            phone: d.formatted_phone_number,
            photo_ref: d.photos?.[0]?.photo_reference || place.photos?.[0]?.photo_reference,
            description: d.editorial_summary?.overview || '',
            types: d.types || [],
            reviews: allReviews,
            matched_keywords: placeKeywordSources[place.place_id] || [],
            lat: d.geometry?.location?.lat,
            lng: d.geometry?.location?.lng,
          };
        } catch (e) {
          return {
            place_id: place.place_id,
            name: place.name,
            rating: place.rating,
            user_ratings_total: place.user_ratings_total,
            address: place.formatted_address,
            reviews: [],
            matched_keywords: placeKeywordSources[place.place_id] || [],
            lat: place.geometry?.location?.lat,
            lng: place.geometry?.location?.lng,
          };
        }
      }));
      detailed.push(...batchResults);
    }

    res.status(200).json({ results: detailed, total: detailed.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
}
