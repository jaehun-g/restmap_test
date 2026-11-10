ALTER TABLE tb_lounge ADD COLUMN IF NOT EXISTS lg_operation_status varchar(20);
ALTER TABLE tb_lounge ADD COLUMN IF NOT EXISTS lg_operation_start_date varchar(10);
ALTER TABLE tb_lounge ADD COLUMN IF NOT EXISTS lg_operation_note varchar(200);
ALTER TABLE tb_lounge ADD COLUMN IF NOT EXISTS lg_operation_source varchar(200);
ALTER TABLE tb_lounge ADD COLUMN IF NOT EXISTS lg_operation_review_date varchar(10);
