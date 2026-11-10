-- House B/L numbers the sender wrote next to container numbers in the e-mail ({container: number}).
ALTER TABLE mail_threads ADD COLUMN hbl_numbers TEXT;
