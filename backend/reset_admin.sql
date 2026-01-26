UPDATE users SET email = 'admin@radiotedu.com', password_hash = '$2a$10$pa/3yRHDBJcq/YKTzuhG7uP3v/UUsrJaJIlS66yQiHzLXD7e4NwsTS', role = 'admin' WHERE email ILIKE '%admin%';
