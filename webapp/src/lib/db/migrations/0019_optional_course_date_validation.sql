-- Make subscriber course-date validation configurable (default: enabled).
INSERT INTO `settings` (`key`, `value`, `data_type`, `description`)
VALUES (
  'enforce_course_date_range',
  'true',
  'boolean',
  'Accetta le strisciate dei corsisti solo nelle date comprese in almeno una loro iscrizione.'
);
