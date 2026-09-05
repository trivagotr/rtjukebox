INSERT INTO avatar_items (item_id, slot, title, cost_points, rarity, is_default, enabled)
VALUES ('radiotedu-tee', 'top', 'RadioTEDU Tee', 45, 'common', false, true)
ON CONFLICT (item_id) DO NOTHING;
