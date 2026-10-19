// "ca-pub-1234" -> the meta tag and ads.txt line AdSense asks for, or null
// when no valid publisher ID is set. f08c47fec0942fa0 is Google's own fixed
// ID that every AdSense ads.txt line ends with.
export function adsenseFiles(client) {
  const id = (client || "").trim();
  if (!/^ca-pub-\d+$/.test(id)) return null;
  return {
    metaTag: `<meta name="google-adsense-account" content="${id}" />`,
    adsTxt: `google.com, ${id.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`,
  };
}
