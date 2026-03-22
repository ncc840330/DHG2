const webpush = require('web-push');

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
    const { subscription, title, body } = JSON.parse(event.body);
    await webpush.sendNotification(subscription, JSON.stringify({ title, body }));
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
