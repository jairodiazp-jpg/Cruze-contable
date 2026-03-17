-- Seed baseline firewall domain catalog used by category blocking.
-- Uses global rows (company_id NULL) and is idempotent.

INSERT INTO public.firewall_domain_database (category, domain, company_id)
VALUES
  ('youtube', 'youtube.com', NULL),
  ('youtube', 'ytimg.com', NULL),
  ('youtube', 'googlevideo.com', NULL),

  ('social', 'facebook.com', NULL),
  ('social', 'instagram.com', NULL),
  ('social', 'tiktok.com', NULL),
  ('social', 'x.com', NULL),
  ('social', 'twitter.com', NULL),

  ('streaming', 'netflix.com', NULL),
  ('streaming', 'disneyplus.com', NULL),
  ('streaming', 'spotify.com', NULL),
  ('streaming', 'twitch.tv', NULL),

  ('gaming', 'steampowered.com', NULL),
  ('gaming', 'epicgames.com', NULL),
  ('gaming', 'riotgames.com', NULL),

  ('adult', 'pornhub.com', NULL),
  ('adult', 'xvideos.com', NULL),

  ('vpn', 'nordvpn.com', NULL),
  ('vpn', 'expressvpn.com', NULL),
  ('vpn', 'surfshark.com', NULL),

  ('proxy', 'hidemyass.com', NULL),
  ('proxy', 'kproxy.com', NULL),

  ('torrent', 'thepiratebay.org', NULL),
  ('torrent', '1337x.to', NULL),

  ('shopping', 'amazon.com', NULL),
  ('shopping', 'ebay.com', NULL),
  ('shopping', 'aliexpress.com', NULL),

  ('ai-tools', 'chatgpt.com', NULL),
  ('ai-tools', 'openai.com', NULL),
  ('ai-tools', 'claude.ai', NULL),
  ('ai-tools', 'gemini.google.com', NULL),

  ('dating', 'tinder.com', NULL),
  ('dating', 'bumble.com', NULL)
ON CONFLICT (category, domain) DO NOTHING;
