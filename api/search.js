export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { location, keyword } = req.query;
  if (!location) return res.status(400).json({ error: 'Location is required' });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  try {
    // Step 1: Text search — fetch ALL pages (up to 60 results across 3 pages)
    const searchQuery = keyword ? `${keyword} restaurants in ${location}` : `restaurants in ${location}`;
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&type=restaurant&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      return res.status(500).json({ error: searchData.status, message: searchData.error_message });
    }

    let places = searchData.results || [];
    let nextToken = searchData.next_page_token;

    // Fetch page 2 and 3 if available (Google requires ~2s delay for token)
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

    // Step 2: Get details + reviews for each place (in parallel batches of 10)
    const batchSize = 10;
    const detailed = [];

    for (let i = 0; i < places.length; i += batchSize) {
      const batch = places.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(async (place) => {
        try {
          // Fetch both "most_relevant" and "newest" reviews to maximize coverage
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
            lat: d.geometry?.location?.lat,
            lng: d.geometry?.location?.lng,
          };
        } catch (e) {
          // If a single place fails, return basic info without details
          return {
            place_id: place.place_id,
            name: place.name,
            rating: place.rating,
            user_ratings_total: place.user_ratings_total,
            address: place.formatted_address,
            reviews: [],
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
