const axios = require('axios');
const xml2js = require('xml2js');

async function getCanadianTrends() {
  try {
    const res = await axios.get('https://trends.google.com/trending/rss?geo=CA', { timeout: 5000 });
    const parsed = await xml2js.parseStringPromise(res.data);
    const items = parsed.rss.channel[0].item || [];
    return items.slice(0, 8).map(item => ({
      title: item.title[0],
      traffic: item['ht:approx_traffic']?.[0] || '100+',
      url: item.link?.[0] || '#'
    }));
  } catch(e) {
    console.error('Trends fetch error:', e.message);
    return [];
  }
}

module.exports = { getCanadianTrends };
