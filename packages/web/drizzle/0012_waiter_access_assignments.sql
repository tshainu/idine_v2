ALTER TABLE users ADD COLUMN accessible_table_ids TEXT;
ALTER TABLE users ADD COLUMN linked_cashier_id INTEGER REFERENCES users(id);
