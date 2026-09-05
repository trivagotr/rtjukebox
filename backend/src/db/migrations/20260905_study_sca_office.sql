BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE study_sessions DROP CONSTRAINT IF EXISTS study_sessions_location_check;
ALTER TABLE study_sessions ADD CONSTRAINT study_sessions_location_check
    CHECK (location IN ('library', 'chim-alan', 'grass-amphitheatre', 'sports-center', 'auditorium', 'learning-lab', 'sca-office'));

-- Extend only Social's room allow-lists. No rows or account data are changed.
ALTER TABLE study_world_chat_messages
    DROP CONSTRAINT IF EXISTS study_world_chat_messages_room_id_check;
ALTER TABLE study_world_chat_messages
    ADD CONSTRAINT study_world_chat_messages_room_id_check
    CHECK (room_id IN ('library', 'chim-alan', 'grass-amphitheatre', 'sports-center', 'auditorium', 'learning-lab', 'sca-office'));

ALTER TABLE study_player_reports
    DROP CONSTRAINT IF EXISTS study_player_reports_room_id_check;
ALTER TABLE study_player_reports
    ADD CONSTRAINT study_player_reports_room_id_check
    CHECK (room_id IN ('library', 'chim-alan', 'grass-amphitheatre', 'sports-center', 'auditorium', 'learning-lab', 'sca-office'));

ALTER TABLE study_seat_reservations
    DROP CONSTRAINT IF EXISTS study_seat_reservations_room_id_check;
ALTER TABLE study_seat_reservations
    ADD CONSTRAINT study_seat_reservations_room_id_check
    CHECK (room_id IN ('library', 'chim-alan', 'grass-amphitheatre', 'sports-center', 'auditorium', 'learning-lab', 'sca-office'));

COMMIT;
