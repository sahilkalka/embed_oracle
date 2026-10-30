const ejs = require('ejs');
const path = require('path');
function canShowAd(settings, slot) {
  return settings.enable_adsense === 'true' && /^ca-pub-\d{16}$/.test(settings.adsense_pub_id || '') && /^\d{10}$/.test(slot || '');
}
function renderAd(settings, slot, format = 'auto') {
  if (!canShowAd(settings, slot)) return Promise.resolve('');
  return ejs.renderFile(path.join(__dirname, '../../views/partials/ad-slot.ejs'), { settings, slot, format, canShowAd });
}
module.exports = { canShowAd, renderAd };
