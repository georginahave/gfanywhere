export default async function handler(req, res) {
  const { ref } = req.query;
  if (!ref) return res.status(400).json({ error: 'No photo ref' });

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${ref}&key=${apiKey}`;

  const photoRes = await fetch(photoUrl);
  if (!photoRes.ok) return res.status(404).end();

  const buffer = await photoRes.arrayBuffer();
  const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(Buffer.from(buffer));
}
