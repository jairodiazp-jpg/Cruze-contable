-- Expand streaming category domains to improve Netflix blocking effectiveness.

INSERT INTO public.firewall_domain_database (category, domain, company_id)
VALUES
  ('streaming', 'netflix.net', NULL),
  ('streaming', 'nflxvideo.net', NULL),
  ('streaming', 'nflximg.net', NULL),
  ('streaming', 'nflxso.net', NULL),
  ('streaming', 'nflxext.com', NULL),
  ('streaming', 'nflxsearch.net', NULL)
ON CONFLICT (category, domain) DO NOTHING;
