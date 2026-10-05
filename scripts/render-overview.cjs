// Create an editable SVG diagram and its PNG using existing runtime/UI assets.
const fs = require('node:fs');
const path = require('node:path');
const playwright = process.env.WPT_NODE_MODULES
  ? require(path.join(process.env.WPT_NODE_MODULES, 'playwright')) : require('playwright');
const root = path.resolve(__dirname, '..');
const images = path.join(root, 'docs', 'images');
const icon = fs.readFileSync(path.join(root, 'icon128.png')).toString('base64');
const settings = fs.readFileSync(path.join(images, 'settings.png'));
const settingsHeight = 420 * settings.readUInt32BE(20) / settings.readUInt32BE(16);
const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version.replace(/\.0$/, '');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img" aria-labelledby="title description">
<title id="title">Webex Power Tools ${version}</title>
<desc id="description">English product overview. Double-click the left quarter to seek back, the right quarter to seek forward, or hold Space or left click for temporary speed. Includes the actual settings interface.</desc>
<defs>
  <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#07121b"/><stop offset="1" stop-color="#0d1b25"/></linearGradient>
  <linearGradient id="brand"><stop stop-color="#04c7ed"/><stop offset="1" stop-color="#62f35b"/></linearGradient>
  <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#193f64"/><stop offset="1" stop-color="#4b829c"/></linearGradient>
  <linearGradient id="lake" x2="0" y2="1"><stop stop-color="#286478"/><stop offset="1" stop-color="#102937"/></linearGradient>
  <linearGradient id="back"><stop stop-color="#007cfc" stop-opacity=".48"/><stop offset="1" stop-color="#009ddd" stop-opacity=".16"/></linearGradient>
  <linearGradient id="forward"><stop stop-color="#00d8b0" stop-opacity=".17"/><stop offset="1" stop-color="#11d88b" stop-opacity=".48"/></linearGradient>
  <clipPath id="player"><rect x="48" y="252" width="970" height="510" rx="17"/></clipPath>
  <clipPath id="popup"><rect x="1104" y="204" width="420" height="650" rx="12"/></clipPath>
</defs>
<rect width="1600" height="1000" fill="url(#bg)"/>
<g font-family="Segoe UI, Arial, sans-serif" fill="#f5f8fb">
  <image x="48" y="48" width="110" height="110" href="data:image/png;base64,${icon}"/>
  <text x="183" y="90" font-size="30" font-weight="600" fill="#dbe6f0">Webex</text>
  <text x="180" y="150" font-size="64" font-weight="750" fill="url(#brand)">Power Tools</text>
  <text x="48" y="206" font-size="29" fill="#a9bdcc">More control over your Webex recordings.</text>
  <rect x="1360" y="66" width="164" height="44" rx="22" fill="#152b39" stroke="#294757"/>
  <text x="1442" y="95" text-anchor="middle" font-size="20" font-weight="600">VERSION ${version}</text>
  <text x="1090" y="163" font-size="14" font-weight="700" letter-spacing="2" fill="#92a9bc">YOUR SETTINGS. YOUR WORKFLOW.</text>
  <rect x="36" y="240" width="994" height="570" rx="27" fill="#08121b" stroke="#294353" stroke-width="3"/>
  <g clip-path="url(#player)">
    <rect x="48" y="252" width="970" height="510" fill="url(#sky)"/>
    <path d="M48 467L150 380L233 424L352 331L429 403L557 304L674 414L778 344L890 419L1018 366V762H48Z" fill="#32607a"/>
    <path d="M48 515L154 432L259 470L402 375L498 486L658 401L783 489L888 413L1018 490V762H48Z" fill="#1d4758"/>
    <path d="M330 349L352 331L386 362L361 354L350 365Z M516 340L557 304L604 348L564 335L550 348Z M756 361L778 344L810 369L782 360Z" fill="#b4d5df" opacity=".8"/>
    <rect x="48" y="576" width="970" height="186" fill="url(#lake)"/>
    <path d="M48 571C160 548 250 610 368 580S585 546 713 578S885 553 1018 575" fill="none" stroke="#78a6aa" stroke-width="3" opacity=".5"/>
    <path d="M70 627H298M210 650H462M554 610H925M620 690H874M110 727H532" stroke="#82b7c0" stroke-width="2" opacity=".15"/>
    <rect x="48" y="252" width="242.5" height="510" fill="url(#back)"/>
    <rect x="775.5" y="252" width="242.5" height="510" fill="url(#forward)"/>
    <path d="M290.5 252V762" stroke="#69d0ff" stroke-width="2" opacity=".8"/>
    <path d="M775.5 252V762" stroke="#5bffc6" stroke-width="2" opacity=".8"/>
  </g>
  <text x="169" y="293" text-anchor="middle" font-size="14" font-weight="700" fill="#cae7ff" letter-spacing="1.5">LEFT 25%</text>
  <text x="897" y="293" text-anchor="middle" font-size="14" font-weight="700" fill="#c5ffec" letter-spacing="1.5">RIGHT 25%</text>
  <rect x="493" y="278" width="80" height="46" rx="13" fill="#101c26" fill-opacity=".88" stroke="#51717c"/>
  <text x="533" y="309" text-anchor="middle" font-size="25" font-weight="700">2×</text>
  <path d="M181 466L149 489L181 512Z M148 466L116 489L148 512Z M885 466L917 489L885 512Z M918 466L950 489L918 512Z" fill="#fff"/>
  <text x="169" y="560" text-anchor="middle" font-size="51" font-weight="750">−5s</text>
  <text x="897" y="560" text-anchor="middle" font-size="51" font-weight="750">+5s</text>
  <text x="169" y="598" text-anchor="middle" font-size="18" fill="#daebf6">Double-click to seek</text>
  <text x="897" y="598" text-anchor="middle" font-size="18" fill="#daebf6">Double-click to seek</text>
  <text x="169" y="627" text-anchor="middle" font-size="16" fill="#daebf6">Then −5s per click</text>
  <text x="897" y="627" text-anchor="middle" font-size="16" fill="#daebf6">Then +5s per click</text>
  <path d="M511 431Q505 428 505 436V512Q505 520 512 516L569 480Q576 475 569 471Z" fill="#fff"/>
  <rect x="367" y="548" width="332" height="84" rx="17" fill="#091823" fill-opacity=".9" stroke="#395667"/>
  <text x="533" y="581" text-anchor="middle" font-size="22" font-weight="650">Hold Space or left click</text>
  <text x="533" y="612" text-anchor="middle" font-size="18" fill="#b3c9d7">Release to restore your speed</text>
  <text x="533" y="705" text-anchor="middle" font-size="17" fill="#d0e5ef">CENTER 50% · Webex / fullscreen double-click</text>
  <rect x="68" y="781" width="930" height="5" rx="2.5" fill="#2c4656"/>
  <rect x="68" y="781" width="310" height="5" rx="2.5" fill="url(#brand)"/>
  <circle cx="378" cy="783.5" r="7" fill="#f5f8fb"/>
  <rect x="1088" y="188" width="452" height="732" rx="24" fill="#0d131b" stroke="#294353" stroke-width="2"/>
  <image x="1104" y="204" width="420" height="${settingsHeight}" href="data:image/png;base64,${settings.toString('base64')}" clip-path="url(#popup)"/>
  <path d="M1110 868H1518" stroke="#263b4a"/>
  <text x="1314" y="897" text-anchor="middle" font-size="16" fill="#9db2c3">Actual settings UI · scroll for more</text>
  <g fill="#101f2b" stroke="#253d4c"><rect x="48" y="835" width="307" height="85" rx="16"/><rect x="371" y="835" width="307" height="85" rx="16"/><rect x="694" y="835" width="324" height="85" rx="16"/></g>
  <text x="70" y="870" font-size="21" font-weight="700" fill="#35d1ee">J / K / L</text>
  <text x="70" y="897" font-size="16" fill="#a8bfce">Seek · play / pause · seek</text>
  <text x="393" y="870" font-size="21" font-weight="700" fill="#56eda1">M + ↑ / ↓</text>
  <text x="393" y="897" font-size="16" fill="#a8bfce">Reversible mute · volume</text>
  <text x="716" y="870" font-size="21" font-weight="700" fill="#35d1ee">Make it yours</text>
  <text x="716" y="897" font-size="16" fill="#a8bfce">Seek times · speed · 14 languages</text>
  <text x="48" y="963" font-size="15" fill="#7c99ad">Illustrative player · default controls shown · settings captured with development fixtures</text>
</g>
</svg>`;

async function main() {
  fs.writeFileSync(path.join(images, 'overview.svg'), svg);
  const browser = await playwright.chromium.launch({ headless: true, channel: process.env.WPT_BROWSER_CHANNEL || 'chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await page.evaluate(() => Promise.all([...document.querySelectorAll('image')].map(image => {
      const img = new Image(); img.src = image.getAttribute('href'); return img.decode();
    })));
    await page.screenshot({ path: path.join(images, 'overview.png') });
    console.log('Created docs/images/overview.svg and overview.png (1600 × 1000).');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
