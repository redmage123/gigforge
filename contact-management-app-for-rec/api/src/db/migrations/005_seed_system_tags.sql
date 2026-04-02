INSERT INTO tags (name, colour, is_system)
VALUES
  ('candidate',   '#3B82F6', TRUE),
  ('client',      '#10B981', TRUE),
  ('warm lead',   '#F59E0B', TRUE),
  ('placed',      '#8B5CF6', TRUE),
  ('interviewed', '#6B7280', TRUE)
ON CONFLICT (name) DO NOTHING;
