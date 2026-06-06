-- FSRS fields on cards
-- stability and difficulty replace SM-2's ease_factor for scheduling
-- reps, lapses, last_review, scheduled_days, elapsed_days track FSRS card history
-- learning_step (existing column) is repurposed to store FSRS learning_steps (step index within learning phase)
-- ease_factor and the old learning_step semantics are now unused legacy columns (kept, not dropped)

alter table cards add column if not exists stability real default 0;
alter table cards add column if not exists difficulty real default 0;
alter table cards add column if not exists reps int default 0;
alter table cards add column if not exists lapses int default 0;
alter table cards add column if not exists last_review timestamptz;
alter table cards add column if not exists scheduled_days int default 0;
alter table cards add column if not exists elapsed_days int default 0;

notify pgrst, 'reload schema';
