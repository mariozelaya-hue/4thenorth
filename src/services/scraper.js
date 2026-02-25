const ogs = require('open-graph-scraper');
const crypto = require('crypto');

async function scrapeUrl(url) {
  try {
    const { result } = await ogs({ url, timeout: 10000 });

    const title = result.ogTitle || result.twitterTitle || result.dcTitle || url;
    const description = result.ogDescription || result.twitterDescription || result.dcDescription || '';
    const imageUrl = result.ogImage?.[0]?.url || result.twitterImage?.[0]?.url || null;
    const siteName = result.ogSiteName || extractDomain(url);

    return {
      title: title.trim(),
      description: description.trim(),
      imageUrl,
      sourceName: siteName,
      sourceUrl: url,
      sourceHash: crypto.createHash('sha256').update(url).digest('hex'),
    };
  } catch (err) {
    console.error('Scraper error:', err.message);
    // Fallback: return what we can
    return {
      title: url,
      description: '',
      imageUrl: null,
      sourceName: extractDomain(url),
      sourceUrl: url,
      sourceHash: crypto.createHash('sha256').update(url).digest('hex'),
      error: err.message,
    };
  }
}

function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace('www.', '').split('.').slice(0, -1).join('.');
  } catch {
    return 'Unknown';
  }
}

module.exports = { scrapeUrl };
