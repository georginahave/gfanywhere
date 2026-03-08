export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { location, keyword } = req.query;
  if (!location) return res.status(400).json({ error: 'Location is required' });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  try {
    // Step 1: Text search for restaurants
    const searchQuery = keyword ? `${keyword} restaurants in ${location}` : `restaurants in ${location}`;
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&type=restaurant&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      return res.status(500).json({ error: searchData.status, message: searchData.error_message });
    }

    const places = (searchData.results || []).slice(0, 12);

    // Step 2: Get details + reviews for each place
    const detailed = await Promise.all(places.map(async (place) => {
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,rating,user_ratings_total,formatted_address,photos,reviews,price_level,opening_hours,website,formatted_phone_number,geometry,editorial_summary,types,serves_beer,serves_wine,serves_vegetarian_food,takeout,delivery,dine_in&key=${apiKey}`;
      const detailRes = await fetch(detailUrl);
      const detailData = await detailRes.json();
      const d = detailData.result || {};
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
        serves_vegetarian: d.serves_vegetarian_food || false,
        takeout: d.takeout || false,
        delivery: d.delivery || false,
        reviews: (d.reviews || []).slice(0, 5).map(r => ({
          author: r.author_name,
          rating: r.rating,
          text: r.text,
          time: r.relative_time_description,
          profile_photo: r.profile_photo_url,
        })),
        lat: d.geometry?.location?.lat,
        lng: d.geometry?.location?.lng,
      };
    }));

    res.status(200).json({ results: detailed, total: detailed.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error', message: err.message });
  }
}
