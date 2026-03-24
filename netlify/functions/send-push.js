const webpush = require('web-push');

const FIREBASE_URL = 'https://tatai-tracker-default-rtdb.firebaseio.com';

webpush.setVapidDetails(
  'mailto:pakai.ildiko@gmail.com',
  process.env.VAPID_PUBLIC_KEY || 'BK3xvCCzNJbkYNDvMkRVF9z5N2rK9vr31tJkGmzSwXJ9zpzs4Q1K_0WBYCp5qDqfsVHvk0Xy0U5xVacWlwQxePx_PLy6R_FSWVix7Vjwl-A',
  process.env.VAPID_PRIVATE_KEY || 'zIHbOpfqj7R49-M7jkeYPzZCDHN2IjNQF__VBo7At2Q'
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { title, body } = JSON.parse(event.body);

    // Fetch all push subscriptions from Firebase
    const res = await fetch(`${FIREBASE_URL}/pushSubscriptions.json`);
    const subs = await res.json();

    if (!subs || typeof subs !== 'object') {
      return { statusCode: 200, body: JSON.stringify({ success: true, sent: 0 }) };
    }

    const payload = JSON.stringify({ title, body });
    const results = await Promise.allSettled(
      Object.entries(subs).map(async ([key, sub]) => {
        try {
          await webpush.sendNotification(sub, payload);
        } catch (err) {
          // Remove expired or invalid subscriptions (410 Gone, 404 Not Found)
          if (err.statusCode === 410 || err.statusCode === 404) {
            await fetch(`${FIREBASE_URL}/pushSubscriptions/${key}.json`, { method: 'DELETE' });
          }
          throw err;
        }
      })
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return { statusCode: 200, body: JSON.stringify({ success: true, sent }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
